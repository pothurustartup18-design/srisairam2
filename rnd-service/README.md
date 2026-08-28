# School ERP — Backend API Service (rnd-service)

This is the Node.js + Express + TypeScript backend API service for the School ERP and Automation system. It connects to a MongoDB database (local or Atlas) and serves endpoints for student, teacher, and attendance management with Passport.js & JWT authentication.

## Features Included
* **Secure JWT Authentication**: Passport local login strategy, cookie-based token rotation (`/refresh`), and blacklisted logout invalidation.
* **Granular RBAC System**: Custom middleware checks user role permissions and validates parent-student relationship boundaries to secure student records from URL tampering.
* **Live Database seeding**: Ready scripts to quickly seed and test MongoDB collections.

---

## Quick Start Guide

### 1. Prerequisites
Ensure you have **Node.js** and **npm** installed.

### 2. Environment Configuration
1. In this folder, copy the environment template file:
   ```bash
   cp .env.example .env
   ```
2. Open the new `.env` file and fill in your details:
   * `PORT`: Development port (default `5000`)
   * `MONGODB_URI`: Your local MongoDB URI or MongoDB Atlas Cluster connection string
   * `JWT_SECRET` & `JWT_REFRESH_SECRET`: Safe security passwords for signing access and refresh tokens

### 3. Install Dependencies
Run the installation command:
```bash
npm install
```

### 4. Seed the Database
To reset and seed the database with admin, teacher, parent, and student test records:
```bash
npm run seed
```

### 5. Start API Server
Run the dev server:
```bash
npm run dev
```
The API server will run at **`http://localhost:5000/api`**.
