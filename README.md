OpenStore, a modern open-source store front app

## Installation

1. Clone the repository

- Install the frontend

2. Go to the frontend directory
3. Run `npm install`

- Install the backend

4. Go to the backend directory
5. Create a virtual environment `python3 -m venv venv`
6. Activate the virtual environment `source venv/bin/activate` (Linux) or `venv\Scripts\activate` (Windows)
7. Run `pip install -r requirements.txt`

## Setting up the database

- Create the database

1. Install PostgreSQL
2. Create a database and name it something you like
3. Have a user with full access to the database and a password

- Configure the backend

4. Create a `.env` file in the backend directory with the following content:

```
STORE_ID = 0
HOST = "localhost"
DATABASE = "database_name"
USER = "database_user"
PASS = "database_password"
SECRET = "some long secret key"
ALGORITHM = "HS256"
```

5. Replace the values with your own

- Create the tables

6. Go to the backend directory
7. Make sure the virtual environment is activated
8. Run `python init.py`

- Configure the frontend

9. Go to the frontend directory
10. Create a `.env` file with the following content:

```
VITE_SERVER_URL=http://localhost:8000
VITE_STORE_ID=0
```

11. Leave these values exactly the same

## Running the app

- Run the frontend

8. Go to the frontend directory
9. Run `npm run dev`

- Run the backend

10. Go to the backend directory
11. Make sure the virtual environment is activated
12. Run `uvicorn main:app --reload`

## First steps

1. Go to `http://localhost:5173` in your browser
2. Login with the default credentials:

- Username: `george`
- Password: `verystrongpassword`

## License

This project is licensed under the MIT License. See the LICENSE file for more details.
