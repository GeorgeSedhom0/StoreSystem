from init import connect_to_database, create_all_triggers


def drop_all_triggers(cur):
    # Drop triggers from tables
    cur.execute("DROP TRIGGER IF EXISTS trigger_add_product_to_all_stores ON products;")
    cur.execute("DROP TRIGGER IF EXISTS trigger_update_stock_insert ON products_flow;")
    cur.execute(
        "DROP TRIGGER IF EXISTS trigger_insert_cash_flow_after_insert ON bills;"
    )
    cur.execute("DROP TRIGGER IF EXISTS trigger_add_bill_to_collections ON bills;")
    cur.execute(
        "DROP TRIGGER IF EXISTS trigger_update_cash_flow_after_update ON bills;"
    )
    cur.execute(
        "DROP TRIGGER IF EXISTS trigger_sync_store_to_associated_party ON store_data;"
    )
    cur.execute(
        "DROP TRIGGER IF EXISTS trigger_insert_cash_flow_after_insert_salary ON salaries;"
    )
    cur.execute(
        "DROP TRIGGER IF EXISTS trigger_insert_cash_flow_after_insert_installment ON installments;"
    )
    cur.execute(
        "DROP TRIGGER IF EXISTS trigger_insert_cash_flow_after_insert_installment_flow ON installments_flow;"
    )
    cur.execute(
        "DROP TRIGGER IF EXISTS trigger_update_product_price_after_insert ON products_flow;"
    )
    cur.execute(
        "DROP TRIGGER IF EXISTS trigger_update_total_after_insert ON cash_flow;"
    )
    cur.execute(
        "DROP TRIGGER IF EXISTS trigger_bubble_fix_total_after_update ON cash_flow;"
    )

    # Drop corresponding functions
    cur.execute("DROP FUNCTION IF EXISTS add_product_to_all_stores() CASCADE;")
    cur.execute("DROP FUNCTION IF EXISTS update_stock_after_insert() CASCADE;")
    cur.execute("DROP FUNCTION IF EXISTS insert_cash_flow_after_insert() CASCADE;")
    cur.execute("DROP FUNCTION IF EXISTS add_bill_to_collections() CASCADE;")
    cur.execute("DROP FUNCTION IF EXISTS sync_store_to_associated_party() CASCADE;")
    cur.execute(
        "DROP FUNCTION IF EXISTS insert_cash_flow_after_insert_salary() CASCADE;"
    )
    cur.execute(
        "DROP FUNCTION IF EXISTS insert_cash_flow_after_insert_installment() CASCADE;"
    )
    cur.execute(
        "DROP FUNCTION IF EXISTS insert_cash_flow_after_insert_installment_flow() CASCADE;"
    )
    cur.execute("DROP FUNCTION IF EXISTS update_product_price_after_insert() CASCADE;")
    cur.execute("DROP FUNCTION IF EXISTS update_total_after_insert() CASCADE;")
    cur.execute("DROP FUNCTION IF EXISTS bubble_fix_total_after_update() CASCADE;")
    cur.execute("DROP FUNCTION IF EXISTS update_cash_flow_after_update() CASCADE;")
    cur.execute("DROP FUNCTION IF EXISTS add_negative_one_bill() CASCADE;")
    cur.execute("DROP FUNCTION IF EXISTS bubble_fix_total_after_delete() CASCADE;")
    cur.execute(
        "DROP FUNCTION IF EXISTS delete_cash_flow_after_delete_installment_flow() CASCADE;"
    )
    cur.execute(
        "DROP FUNCTION IF EXISTS update_products_flow_total_after_insert() CASCADE;"
    )


def reset_all_triggers(cur):
    print("Resetting all triggers...")
    drop_all_triggers(cur)
    create_all_triggers(cur)
    print("All triggers have been reset.")


def main():
    conn, cur = connect_to_database()
    try:
        reset_all_triggers(cur)
        conn.commit()
        print("Database triggers reset successfully!")
    except Exception as e:
        conn.rollback()
        print(f"Error resetting triggers: {str(e)}")
    finally:
        cur.close()
        conn.close()
        print("Database connection closed.")


if __name__ == "__main__":
    main()
