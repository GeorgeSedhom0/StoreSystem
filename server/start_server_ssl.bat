cd env && cd Scripts && activate && cd .. && cd .. && uvicorn main:app --host 0.0.0.0 --port 8000 --ssl-keyfile localhost-key.pem --ssl-certfile localhost.pem --reload