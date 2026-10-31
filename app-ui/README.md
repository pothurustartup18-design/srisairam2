# School ERP — Frontend Client (rnd-ui)

This is the React + TypeScript + Vite frontend client for the School ERP and Automation system. It connects directly with the backend API.

## Features Included
* **Unified Portal Login**: Access page with role selector dropdown (Admin, Teacher, Parent).
* **Role-Based Access Control (RBAC)**: Interface sidebar items, dashboard views, and routes automatically match the active role's permissions.
* **Persistent Authentication**: Cookie-based Silent JWT refresh keeps users securely logged in across page reloads.

## Quick Start Guide

### 1. Prerequisite Setup
Ensure your local backend server is running on **`http://localhost:5000`**.

### 2. Install Packages
In this folder, run:
```bash
npm install
```

### 3. Start Development Server
Start the client server:
```bash
npm run dev
```
By default, the application will run at **`http://localhost:5173`** or **`http://localhost:5174`**.

---

## Connection Settings
* **Target Backend API**: Configured inside [src/constants/index.ts](src/constants/index.ts):
  ```typescript
  export const API_BASE = 'http://localhost:5000/api';
  ```
* **CORS Permissions**: The backend server is configured to allow requests from both ports `5173` and `5174` seamlessly.
