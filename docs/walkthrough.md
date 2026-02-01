# Project Walkthrough: Mutual Fund P&L Estimator

This full-stack application estimates the daily P&L of your mutual funds by tracking the real-time performance of their underlying stock holdings.

## Prerequisites
- **Python** (v3.10+)
- **Node.js** (v18+)
- **MongoDB** (Running locally on default port 27017)

## 1. Start the Backend
The backend runs on **port 8000**.

1.  Open a terminal.
2.  Navigate to the backend folder:
    ```powershell
    cd backend
    ```
3.  Install Python dependencies (if not done):
    ```powershell
    py -m pip install -r requirements.txt
    py -m pip install yfinance requests pandas
    ```
4.  Start the server:
    ```powershell
    uvicorn app:app --reload
    ```
    *or if uvicorn is not in PATH:*
    ```powershell
    py -m uvicorn app:app --reload
    ```

## 2. Start the Frontend
The frontend runs on **port 5173**.

1.  Open a **new** terminal.
2.  Navigate to the frontend folder:
    ```powershell
    cd frontend
    ```
3.  Install dependencies (if not done):
    ```powershell
    npm install
    ```
4.  Start the dev server:
    ```powershell
    npm run dev
    ```

## 3. How to Use

### Step A: One-Time Setup (Monthly)
1.  Open the app in your browser (usually `http://localhost:5173`).
2.  Go to the **Upload Holdings** section.
3.  **Fund Name**: Enter a name (e.g., "HDFC Top 100").
4.  **Scheme Code**: Enter the AMFI Scheme Code (e.g., `119561`).
    - *You can find this on MoneyControl or AMFI website url.*
5.  **File**: Upload the Monthly Portfolio Excel from the AMC.
6.  Click **Upload**. The system will map ISINs to Tickers and save them.

### Step B: Daily Usage
1.  Go to the **Estimate NAV** section.
2.  **Fund Name**: Enter the same name you used above.
3.  **Investment Amount**: Enter your total invested value.
4.  **Investment Date**: Select when you invested.
    - *If left blank, it calculates P&L assuming you invested yesterday.*
5.  Click **Get Live Estimate**.
6.  See your estimated **Today's NAV**, **Real-time Change %**, and **Total P&L**.
