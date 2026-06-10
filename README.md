# LifeDrop - Blood Bank Management System

A comprehensive blood bank management platform built with modern web technologies. This project combines a web-based dashboard with a mobile application to streamline blood donation, inventory, and recipient management.

---

## 📋 Table of Contents

- [Project Overview](#project-overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Installation & Setup](#installation--setup)
- [Running the Application](#running-the-application)
- [Project Components](#project-components)
- [Contributing](#contributing)

---

## 🎯 Project Overview

**LifeDrop** is a mini-project designed to help blood banks manage:
- **Donor Management**: Register and track blood donors
- **Inventory Management**: Monitor blood stock and availability
- **Recipient Management**: Match recipients with available blood types
- **Dashboard**: Visual analytics and reporting for administrators
- **Mobile Application**: Cross-platform mobile support for on-the-go access

The system uses a full-stack JavaScript approach with a Node.js backend and a responsive web frontend, complemented by a React Native mobile application.

---

## ✨ Features

### Core Functionality
- 🩸 **Donor Registration**: Create and manage donor profiles with health information
- 📦 **Blood Inventory**: Track blood type availability and stock levels
- 👥 **Recipient Matching**: Match blood recipients with compatible donors
- 📊 **Dashboard Analytics**: Real-time dashboards with statistics and reports
- 🔐 **Secure Data Management**: Validate and manage user information
- 💌 **Email Notifications**: Send confirmation and notification emails to donors and recipients
- 📱 **Mobile-First Design**: Responsive design for all devices
- 🚀 **Cross-Platform Mobile**: Native mobile apps for iOS, Android, and Web

---

## 🛠 Technology Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework (included in dependencies)
- **SQLite** - Lightweight relational database (`bloodbank.db`)
- **JavaScript (ES6+)** - Primary language

### Frontend
- **HTML5** - Markup language
- **CSS3** - Styling
- **JavaScript (Vanilla)** - Client-side logic
- **Bootstrap/Custom CSS** - UI frameworks

### Mobile Application
- **React Native** - Cross-platform mobile development
- **Expo** - Development platform for React Native
- **Expo Router** - File-based navigation for mobile app
- **TypeScript** - Type safety (dev dependency)

### Development Tools
- **npm** - Package manager
- **ESLint** - Code linting (mobile app)

---

## 📁 Project Structure

```
miniProject/
├── README.md                    # Project documentation (this file)
├── package.json                 # Main project dependencies
├── package-lock.json            # Locked dependency versions
├── .env                         # Environment configuration
│
├── server.js                    # Express server configuration & API routes
├── index.html                   # Main web dashboard
├── dashboard.html               # Admin dashboard interface
│
├── bloodbank.db                 # SQLite database
├── db_migrate.js                # Database migration script
├── populate_recipients.js        # Script to populate recipient data
├── fix.js                       # Database fix utilities
│
├── test-email.js                # Email testing script
├── js/                          # Frontend JavaScript modules
├── styles/                      # CSS stylesheets
├── services/                    # Backend service modules
│
├── lifedrop-mobile/             # React Native mobile application
│   ├── package.json             # Mobile app dependencies
│   ├── app/                     # App screens and navigation
│   ├── scripts/                 # Build and utility scripts
│   └── README.md                # Mobile app documentation
│
└── node_modules/                # Project dependencies
```

---

## 🚀 Installation & Setup

### Prerequisites
- **Node.js** (v14 or higher)
- **npm** (v6 or higher)
- **Expo CLI** (for mobile development) - Install with: `npm install -g expo-cli`
- **Git**

### Backend Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/geetha-nalla90/miniProject.git
   cd miniProject
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   Create or update the `.env` file with:
   ```
   PORT=3000
   DATABASE_PATH=./bloodbank.db
   EMAIL_SERVICE=your_email_service
   EMAIL_USER=your_email@example.com
   EMAIL_PASSWORD=your_password
   ```

4. **Initialize the database**
   ```bash
   node db_migrate.js
   ```

5. **Populate sample data (optional)**
   ```bash
   node populate_recipients.js
   ```

### Mobile App Setup

1. **Navigate to mobile directory**
   ```bash
   cd lifedrop-mobile
   ```

2. **Install Expo dependencies**
   ```bash
   npm install
   ```

3. **Install Expo CLI globally** (if not already installed)
   ```bash
   npm install -g expo-cli
   ```

---

## 🏃 Running the Application

### Starting the Backend Server

```bash
node server.js
```

The server will start on `http://localhost:3000` (or the port specified in `.env`)

#### Available API Endpoints
- `GET /` - Main dashboard page
- `GET /dashboard` - Admin dashboard
- `POST /api/donors` - Create a new donor
- `GET /api/donors` - Get all donors
- `GET /api/blood-inventory` - Check blood stock
- `GET /api/recipients` - Get recipient list
- `POST /api/recipients` - Create a new recipient

### Running the Web Application

1. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

2. Access the dashboard at:
   ```
   http://localhost:3000/dashboard
   ```

### Running the Mobile Application

From the `lifedrop-mobile` directory:

```bash
# Start the development server
npm start
```

Or use specific commands:

```bash
# Run on Android emulator
npm run android

# Run on iOS simulator
npm run ios

# Run on web browser
npm run web
```

The Expo CLI will provide options to open the app in:
- **Expo Go** - Limited sandbox environment for testing
- **Android Emulator** - Full Android device emulation
- **iOS Simulator** - Full iOS device emulation
- **Web Browser** - Web version of the app

---

## 📦 Project Components

### Database (`bloodbank.db`)
SQLite database containing tables for:
- **Donors** - Donor profile and health information
- **Recipients** - Recipient details and requirements
- **Blood Inventory** - Blood type stock and availability
- **Transactions** - Donation and distribution records

### Scripts

| Script | Purpose |
|--------|---------|
| `server.js` | Main server application with API routes |
| `db_migrate.js` | Database schema setup and migrations |
| `populate_recipients.js` | Seed database with recipient test data |
| `fix.js` | Database maintenance and fixes |
| `test-email.js` | Test email notification system |

### Utility Folders

| Folder | Purpose |
|--------|---------|
| `js/` | Frontend JavaScript modules and utilities |
| `styles/` | CSS stylesheets for the web interface |
| `services/` | Backend service modules for business logic |

---

## 🤝 Contributing

Contributions are welcome! To contribute:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 License

This project is open source and available under the MIT License.

---

## 📧 Contact & Support

For issues, questions, or suggestions, please open an issue on the [GitHub repository](https://github.com/geetha-nalla90/miniProject).

---

## 🎓 Learning Resources

- [Express.js Documentation](https://expressjs.com/)
- [React Native Documentation](https://reactnative.dev/)
- [Expo Documentation](https://docs.expo.dev/)
- [SQLite Documentation](https://www.sqlite.org/docs.html)
- [Node.js Best Practices](https://nodejs.org/en/docs/)

---

**Last Updated:** June 2026
**Repository:** [geetha-nalla90/miniProject](https://github.com/geetha-nalla90/miniProject)
