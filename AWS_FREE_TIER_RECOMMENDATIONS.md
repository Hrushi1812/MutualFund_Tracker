# AWS recommendations for MutualFund_Tracker (free-tier first)

This guide maps your current stack to AWS services with a **free-tier-first** mindset.
It is based on the current project architecture (FastAPI backend, React/Vite frontend, MongoDB, Brevo email, JWT auth, and optional Fyers integration).

## 1) Current architecture observed in this repo

- **Backend:** FastAPI + Uvicorn (`backend/app.py`)
- **Frontend:** React + Vite static build served via Nginx Docker image (`frontend/Dockerfile` + `frontend/nginx.conf`)
- **Database:** MongoDB configured via `MONGO_URI` (`backend/db.py`, `backend/core/config.py`)
- **Auth/session:** JWT secret in env vars (`backend/core/config.py`)
- **Email:** Brevo API today (`backend/services/email_service.py`)
- **Containerized local setup:** `docker-compose.yml`

---

## 2) Recommended AWS target (free-tier aware)

## A. Frontend hosting (best free option)
**Use AWS Amplify Hosting (Free Tier)**

Why:
- Works well for static React/Vite apps.
- Built-in HTTPS + CDN + Git-based deploys.
- Usually easiest/lowest-maintenance for your frontend.

How it maps:
- Build command: `npm ci && npm run build`
- Output folder: `dist`
- Env var: `VITE_API_URL=<your backend URL>`

Alternative:
- S3 + CloudFront (also common), but Amplify is usually simpler for your case.

## B. Backend API hosting

### Preferred free-start path: **EC2 t2.micro/t3.micro (Free Tier)**
Why:
- You already have Dockerized backend.
- Lowest migration effort.
- Full control over Python deps and token/cache file behavior.

Suggested setup:
- Run backend container behind Nginx or Caddy.
- Put your `.env` as systemd environment file or Docker env file.
- Keep one instance for dev/small prod.

Alternative 1:
- **AWS App Runner**: easier operations, but free tier is limited and can become paid quickly.

Alternative 2 (serverless refactor):
- **API Gateway + Lambda** with FastAPI via adapter.
- Good long term for burst workloads, but higher migration complexity.

## C. Database

### Lowest-friction option:
**Keep MongoDB on MongoDB Atlas free tier**
Why:
- Your code already uses `pymongo` with standard URI.
- Avoid immediate data migration and operational risk.

### If you want AWS-native DB later:
1. **Amazon DocumentDB** (Mongo-compatible) – not usually free-tier friendly.
2. **DynamoDB Free Tier** – free-tier friendly, but requires schema + code redesign.
3. **RDS PostgreSQL Free Tier** – possible if you’re willing to move away from Mongo patterns.

Recommendation:
- Short term: Atlas free tier.
- Medium term: evaluate DynamoDB only if you want deeper AWS-native architecture.

## D. Secrets and configuration
**Use AWS Systems Manager Parameter Store (Standard parameters are free)**

Store:
- `MONGO_URI`
- `SECRET_KEY`
- `FYERS_SECRET_KEY`
- `BREVO_API_KEY`

Why:
- Better than storing plain `.env` in instance filesystem.
- Easy IAM-based access control.

Alternative:
- AWS Secrets Manager (excellent, but paid beyond small usage).

## E. Email
Current: Brevo API.

Free-tier minded choices:
- Keep Brevo (no migration effort).
- Or migrate to **Amazon SES** (low cost; sandbox restrictions initially).

Recommendation:
- Keep Brevo now.
- Consider SES only when you need tighter AWS integration or cost optimization at scale.

## F. File storage / uploads
If you persist uploaded files in future:
- Use **S3 Free Tier** buckets for temporary Excel/CAS uploads.
- Use pre-signed URLs for secure direct upload/download.

## G. Observability
- **CloudWatch Logs** for backend logs (basic usage often sufficient for small apps).
- Optional: CloudWatch alarms for CPU/memory and API errors.

## H. DNS + TLS
- **Route 53** for DNS (paid hosted zone, low monthly cost).
- TLS via ACM (free certificates) when using AWS-managed entry points.

---

## 3) Practical deployment blueprints

## Blueprint 1 (Most practical + free-tier conscious)
- Frontend: Amplify Hosting
- Backend: EC2 micro + Docker
- DB: MongoDB Atlas free tier
- Secrets: SSM Parameter Store
- Email: Brevo (existing)

Pros:
- Minimal code changes
- Fast to launch
- Uses free tiers where possible

Cons:
- EC2 requires patching/ops responsibility

## Blueprint 2 (More AWS-native over time)
- Frontend: Amplify
- Backend: App Runner (or ECS Fargate)
- DB: DynamoDB (refactor needed)
- Secrets: Secrets Manager / SSM
- Email: SES

Pros:
- Better AWS integration and scalability path

Cons:
- Higher migration effort and potential cost growth

---

## 4) Cost-awareness notes (important)

- “Free tier” is typically time-limited or quota-limited.
- Always set **AWS Budgets** with email alerts before production traffic.
- Keep one region and minimal always-on resources.
- Turn off unused instances/services.

---

## 5) Small code changes to prepare for AWS (recommended)

1. Keep all config env-driven (already mostly done).
2. Move hardcoded `SECRET_KEY` fallback to required env var in production.
3. Avoid local token file dependency for distributed deployments (consider DB/Redis for Fyers token if scaling beyond one instance).
4. Add health checks (`/health` already exists) to load balancer/App Runner health probe.
5. Add basic request logging + structured error logs for CloudWatch readability.

---

## 6) Service-by-service quick mapping table

| Project need | Current | AWS option (free-first) | Recommendation |
|---|---|---|---|
| Static frontend hosting | Vite build + Nginx container | Amplify Hosting | Use Amplify first |
| Python API hosting | FastAPI/Uvicorn | EC2 micro | Use EC2 first |
| Database | MongoDB URI | Keep Atlas / later DynamoDB | Keep Atlas initially |
| Secret storage | `.env` | SSM Parameter Store | Adopt now |
| Email sending | Brevo API | Keep Brevo / SES later | Keep Brevo for now |
| Logs/monitoring | app logs | CloudWatch | Enable with retention |
| File/object storage | N/A currently | S3 | Add when upload persistence needed |

---

## 7) What to pick for your project right now

If your goal is **lowest cost + lowest migration risk**, pick this now:

1. Amplify for frontend
2. EC2 micro for backend container
3. MongoDB Atlas free tier
4. SSM Parameter Store for secrets
5. Keep Brevo

This gives a practical AWS footprint while keeping your existing code mostly unchanged.
