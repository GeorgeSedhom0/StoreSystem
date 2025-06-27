import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from os import getenv
import logging

load_dotenv()

# PostgreSQL connection details
HOST = getenv("HOST")
DATABASE = getenv("DATABASE")
USER = getenv("USER")
PASS = getenv("PASS")

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

# Create the connection
conn = psycopg2.connect(host=HOST, database=DATABASE, user=USER, password=PASS)
cursor = conn.cursor(cursor_factory=RealDictCursor)


def update_products_flow_table():
    """Add time and total columns to products_flow table and populate them"""
    logging.info("Adding time and total columns to products_flow table...")

    # Add the new columns as nullable first
    cursor.execute("""
        ALTER TABLE products_flow 
        ADD COLUMN IF NOT EXISTS time TIMESTAMP,
        ADD COLUMN IF NOT EXISTS total INT
    """)
    conn.commit()

    # Fill time column from bills table where bill_id is not null AND bills.time is not null
    logging.info("Filling time column from bills table...")
    cursor.execute("""
        UPDATE products_flow 
        SET time = bills.time
        FROM bills
        WHERE products_flow.bill_id = bills.id 
        AND products_flow.store_id = bills.store_id
        AND bills.time IS NOT NULL
        AND products_flow.time IS NULL
    """)
    conn.commit()

    # Get all products_flow records grouped by store_id and product_id, ordered by id
    logging.info("Processing time interpolation and total calculation...")
    cursor.execute("""
        SELECT store_id, product_id, 
               array_agg(id ORDER BY id) as ids,
               array_agg(time ORDER BY id) as times,
               array_agg(amount ORDER BY id) as amounts
        FROM products_flow 
        GROUP BY store_id, product_id
        ORDER BY store_id, product_id
    """)

    groups = cursor.fetchall()

    for group in groups:
        store_id, product_id, ids, times, amounts = group.values()

        # Interpolate missing times (including records with bill_id but no time in bills table)
        interpolated_times = interpolate_times(times)

        # Calculate cumulative totals
        cumulative_total = 0
        totals = []
        for amount in amounts:
            cumulative_total += amount
            totals.append(cumulative_total)

        # Update records that still need time values (either null or interpolated)
        for i, record_id in enumerate(ids):
            cursor.execute(
                """
                UPDATE products_flow 
                SET time = %s, total = %s 
                WHERE id = %s AND store_id = %s
            """,
                (interpolated_times[i], totals[i], record_id, store_id),
            )

    conn.commit()

    cursor.execute("""
    -- Trigger to update total after insert in products_flow
    CREATE OR REPLACE FUNCTION update_products_flow_total_after_insert()
    RETURNS TRIGGER AS $$
    DECLARE
        latest_total INTEGER;
        latest_record RECORD;
    BEGIN
        -- Lock the latest products_flow record for this store and product to prevent race conditions
        SELECT id, total INTO latest_record
        FROM products_flow
        WHERE store_id = NEW.store_id
        AND product_id = NEW.product_id
        AND (time < NEW.time OR (time = NEW.time AND id < NEW.id))
        ORDER BY time DESC, id DESC
        LIMIT 1
        FOR UPDATE;

        -- If no previous record exists, start from 0
        IF latest_record.total IS NULL THEN
            latest_total := 0;
        ELSE
            latest_total := latest_record.total;
        END IF;

        -- Update the total for the current row
        UPDATE products_flow
        SET total = COALESCE(NEW.amount, 0) + latest_total
        WHERE id = NEW.id
        AND store_id = NEW.store_id;

        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trigger_update_products_flow_total_after_insert
    AFTER INSERT ON products_flow
    FOR EACH ROW
    EXECUTE FUNCTION update_products_flow_total_after_insert();
    """)
    conn.commit()

    logging.info("Successfully updated products_flow table!")


def interpolate_times(times):
    """Interpolate missing times between known timestamps"""
    from datetime import datetime, timedelta

    # Convert None values and find gaps
    result = list(times)
    n = len(result)

    # Find first and last non-null times
    first_time_idx = None
    last_time_idx = None
    for i, t in enumerate(result):
        if t is not None:
            if first_time_idx is None:
                first_time_idx = i
            last_time_idx = i

    # If no times found, use current timestamp for all
    if first_time_idx is None:
        current_time = datetime.now()
        return [current_time + timedelta(seconds=i) for i in range(n)]

    # Handle nulls before first known time
    if first_time_idx > 0:
        start_time = result[first_time_idx] - timedelta(hours=first_time_idx)
        for i in range(first_time_idx):
            result[i] = start_time + timedelta(hours=i)

    # Handle nulls after last known time
    if last_time_idx < n - 1:
        remaining_count = n - last_time_idx - 1
        for i in range(last_time_idx + 1, n):
            offset = i - last_time_idx
            result[i] = result[last_time_idx] + timedelta(hours=offset)

    # Fill gaps between known times
    i = first_time_idx
    while i <= last_time_idx:
        if result[i] is None:
            # Find the next non-null time
            start_idx = i - 1
            end_idx = i

            while end_idx <= last_time_idx and result[end_idx] is None:
                end_idx += 1

            # Interpolate between start_time and end_time
            start_time = result[start_idx]
            end_time = result[end_idx]
            gap_size = end_idx - start_idx

            if gap_size > 1:
                time_delta = (end_time - start_time) / gap_size
                for j in range(start_idx + 1, end_idx):
                    offset = j - start_idx
                    result[j] = start_time + (time_delta * offset)

            i = end_idx
        else:
            i += 1

    # Final safety check - assign current time to any remaining nulls
    current_time = datetime.now()
    for i in range(n):
        if result[i] is None:
            result[i] = current_time + timedelta(seconds=i)
            logging.warning(f"Assigned fallback time to index {i}")

    return result


def main():
    """Main function to run the database update"""
    try:
        logging.info("Starting database update 9...")
        update_products_flow_table()
        logging.info("Database update 9 completed successfully!")
    except Exception as e:
        logging.error(f"Error during database update: {str(e)}")
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    main()
