# 📈 MutualFund Tracker

A mutual fund portfolio tracking application that estimates intraday NAV movement using live market data, allowing users to monitor portfolio value, daily P&L, and investment performance across Lumpsum and SIP holdings. Designed with transparent estimation logic and robust handling of market hours, weekends, and NAV delays.

![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)

---

## 🚀 Features

### Core Functionality
- **Live NAV Estimation** — Estimates current-day NAV in real-time using live stock prices from Yahoo Finance
- **Portfolio Analysis** — Track current value, total invested amount, and real-time P&L
- **Lumpsum Investment Tracking** — Upload mutual fund holdings via Excel with full P&L calculation
- **SIP Investment Tracking** — Track Systematic Investment Plans with installment management

### SIP Features
- Configure SIP with amount, start date, and frequency
- Auto-generation of installment schedules
- Track pending, paid, and skipped installments
- Smart prompts for due SIP installments

### Integrations
- **Fyers API** — Connect your Fyers account for enhanced portfolio data
- **Yahoo Finance** — Real-time stock price data for NAV estimation

### User Experience
- **JWT Authentication** — Secure user registration and login
- **Responsive Dashboard** — Beautiful, modern UI with 3D animations
- **Interactive Charts** — Portfolio visualization with detailed breakdowns

---

## 🛠️ Tech Stack

### Backend
| Technology | Purpose |
|------------|---------|
| **FastAPI** | REST API framework |
| **MongoDB** | Database for holdings & user data |
| **Pydantic** | Data validation |
| **yfinance** | Yahoo Finance API for live prices |
| **Fyers API v3** | Broker integration |
| **JWT (python-jose)** | Authentication tokens |
| **Argon2** | Secure password hashing |
| **Uvicorn** | ASGI server |

### Frontend
| Technology | Purpose |
|------------|---------|
| **React 19** | UI library |
| **Vite** | Build tool |
| **TailwindCSS 4** | Styling |
| **Framer Motion** | Animations |
| **React Three Fiber** | 3D graphics |
| **Lucide React** | Icons |
| **Axios** | HTTP client |
| **React Router v7** | Routing |

---

## 📁 Project Structure

```
MutualFund_Tracker/
├── backend/
│   ├── app.py                 # FastAPI application entry
│   ├── auth.py                # Authentication utilities
│   ├── db.py                  # MongoDB connection
│   ├── nav_logic.py           # NAV estimation logic
│   ├── routes/
│   │   ├── auth.py            # Auth endpoints
│   │   ├── holdings.py        # Holdings CRUD
│   │   ├── portfolio.py       # Portfolio analytics
│   │   └── fyers.py           # Fyers integration
│   ├── services/
│   │   ├── auth_service.py    # Auth business logic
│   │   ├── holdings_service.py # Holdings management
│   │   ├── nav_service.py     # NAV calculation
│   │   └── fyers_service.py   # Fyers API service
│   ├── models/                # Pydantic schemas
│   ├── tests/                 # Unit tests
│   └── requirements.txt       # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── dashboard/     # Dashboard components
│   │   │   ├── home/          # Landing page components
│   │   │   ├── layout/        # Layout components
│   │   │   └── ui/            # Reusable UI components
│   │   ├── pages/             # Page components
│   │   ├── context/           # React context providers
│   │   └── App.jsx            # Main app component
│   └── package.json           # Node dependencies
└── docker-compose.yml         # Docker configuration
```

---

## ⚙️ Setup & Installation

### Prerequisites
- Python 3.11+
- Node.js 18+
- MongoDB (local or Atlas)

### Backend Setup

#### 🚀 Quick Start (Windows)

1. **Create virtual environment** (first time only)
   ```bash
   cd backend
   python -m venv venv
   ```

2. **Configure environment variables**  
   Create a `.env` file in the backend directory (see `.env.example` for reference):
   ```env
   MONGO_URI=mongodb://localhost:27017
   MONGO_DB=mutual_funds
   JWT_SECRET=your-secret-key
   FYERS_APP_ID=your-fyers-app-id
   FYERS_SECRET_KEY=your-fyers-secret
   ```

3. **Install dependencies & Run**
   - Double-click `install_dependencies.bat` to install all packages
   - Double-click `start_backend.bat` to start the server

#### Manual Setup

1. **Navigate to backend directory**
   ```bash
   cd backend
   ```

2. **Create & activate virtual environment**
   ```bash
   python -m venv venv
   venv\Scripts\activate   # Windows
   source venv/bin/activate # Linux/Mac
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Run the server**
   ```bash
   uvicorn app:app --reload --port 8000
   ```

### Frontend Setup

1. **Navigate to frontend directory**
   ```bash
   cd frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**  
   Create a `.env` file:
   ```env
   VITE_API_URL=http://localhost:8000
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

---

## 🔌 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | User registration |
| POST | `/auth/login` | User login |

### Holdings
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/holdings/` | Get user holdings |
| POST | `/holdings/upload` | Upload holdings (Excel) |
| DELETE | `/holdings/{id}` | Delete a holding |

### Portfolio
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/portfolio/analysis` | Get portfolio analysis & P&L |

### Fyers Integration
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/fyers/auth-url` | Get Fyers OAuth URL |
| POST | `/fyers/callback` | Handle OAuth callback |

> 📌 **API Documentation**: Visit `http://localhost:8000/docs` for interactive Swagger UI

---

## 🧮 How It Works

1. **Upload Holdings** — User uploads mutual fund holdings via Excel or manual entry
2. **Fetch Stock Prices** — System fetches live stock prices for underlying assets
3. **Calculate % Change** — Computes price movement for each stock
4. **Weighted Returns** — Multiplies change with stock's portfolio weight
5. **Estimate NAV** — Sums weighted returns to estimate NAV change
6. **Compute P&L** — Calculates real-time profit/loss based on estimated NAV

### SIP Tracking Logic
- User provides total units held and SIP configuration
- System generates installment schedule from start date to today
- Tracks investments: **Invested till Upload** + **Invested after Tracking**
- P&L = (Total Units × Current NAV) - Total Invested

---

## 🐳 Docker Deployment

```bash
docker-compose up --build
```

This starts:
- Backend API on port `8000`
- Frontend on port `3000`

---

## 🧪 Testing

Run backend tests:
```bash
cd backend
pytest tests/ -v
```

---

## 📝 Key Challenges Solved

| Challenge | Solution |
|-----------|----------|
| NAV not available during market hours | Real-time estimation using stock prices |
| Rate limiting on price APIs | Staggered requests with caching |
| Complex SIP tracking | Installment generation with status management |
| Secure authentication | JWT tokens with Argon2 password hashing |

---

## 🔮 Roadmap

- [x] Lumpsum investment tracking
- [x] SIP investment tracking
- [x] Fyers API integration
- [x] XIRR calculation for accurate returns
- [x] Step-up SIP support

---

## 📄 License

This project is for personal/educational use.

---

<p align="center">
  Built with ❤️ by Hrushikesh
</p>
