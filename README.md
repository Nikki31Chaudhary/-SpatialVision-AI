# SpatialVision AI (60% version)

Photo ya camera se wall/floor/table ka area nikalta hai (A4 sheet reference ke saath).

## Run (2 terminals)
Backend:
    cd backend
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000

Frontend:
    cd frontend
    npm install
    npm run dev       # http://localhost:5173

Optional AI selection (MobileSAM): `pip install ultralytics` then `USE_SAM=1 uvicorn main:app --port 8000`
