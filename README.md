# Household Manager

A comprehensive dual-portal web application for household management with separate Admin and Employee interfaces. Built with Next.js 14, TypeScript, Tailwind CSS, and Supabase.

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **UI Components**: shadcn/ui
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Row Level Security)
- **State Management**: TanStack Query (React Query)
- **Calendar**: FullCalendar
- **Internationalization**: next-intl (English, Spanish, Chinese)
- **Forms**: React Hook Form + Zod validation

---

## Features Overview

### Authentication & Access Control

- **Role-based access**: Separate Admin and Employee portals
- **Email/password login** for administrators
- **Passwordless login** for employees (simplified access)
- **Password reset** functionality
- **Session management** with persistent login
- **Protected routes** based on user role

---

## Admin Portal

### Dashboard

- **Real-time metrics overview**:
  - Total employees with active count
  - Pending and overdue tasks
  - Pending leave requests
  - Staff currently on leave
  - Pending supply requests
  - Upcoming important dates (next 7 days)
- **Quick action cards** with drill-down modals
- **Visual summaries** with employee avatars and status badges

### Task Management

- Create, edit, and delete tasks
- **Assign tasks** to individual employees, groups, or all staff
- **Task categories** with custom colors
- **Priority levels**: Low, Medium, High, Urgent
- **Recurring tasks**: Daily, Weekly, Monthly
- **Activity mode**: Tasks with start/end times
- **All-day tasks** option
- Search and filter by status, priority, category
- Mark tasks complete from task list or calendar

### Employee Management

- Add new employees with email invitations
- View employee directory with search
- **Employee profiles**:
  - Contact information
  - Date of birth and hire date
  - Emergency contact
  - Group memberships
  - Notes
- **Important dates tracking**: Birthdays, anniversaries, children's birthdays
- **Employee groups** for team organization
- Edit and delete employees

### Calendar

- **Interactive calendar** with multiple views:
  - Month view
  - Week view
  - 2-day view
  - Day view
- **Event types displayed**:
  - Tasks (with category colors)
  - Leave/time-off (PTO and sick)
  - Child logs (sleep, food, poop, shower)
  - Important dates (birthdays, anniversaries)
- **Filter toggles** for each event type
- Click events for details and quick actions
- Mark tasks complete directly from calendar

### Menu Planning

- **Weekly menu management** with restaurant-style display
- **Meal categories**: Breakfast, Lunch, Dinner, Snacks
- **Bulk paste** with intelligent parsing (supports multiple languages)
- **Chef's notes** section for each week
- Week navigation with current week highlighting
- Auto-scroll to today's meals

### Leave Management

- View all leave requests across employees
- **Filter by employee** and status
- **Approve/deny requests** with admin notes
- **Quick holiday assignment** for multiple employees:
  - Memorial Day, Independence Day, Labor Day
  - Thanksgiving and day after
  - Christmas Eve and Christmas Day
  - New Year's Day
- Track pending, approved, and denied requests
- View request details with employee information

### Supply Request Management

- View pending supply requests from employees
- Approve or reject with admin notes
- Track request status and history
- View product links and descriptions

### Reports & Analytics

- **Team statistics** over custom date ranges
- **Individual employee reports**:
  - Task completion rates
  - PTO vs sick days taken
  - Tasks by category breakdown
- **Visual charts**: Line, Bar, Pie
- **CSV export** for employee reports
- Date range picker with presets

### Child Logs (Restricted Access)

*Available to: Admin, Nanny, Teacher roles*

- **Track activities** for children (customizable names)
- **Log categories**:
  - Sleep (with start/end times)
  - Food/Meals
  - Poop/Diaper changes
  - Shower/Bath
- Create, edit, and delete logs
- **Filter by child** and category
- **Date range filtering**: Today, This Week, This Month
- 12-hour AM/PM time format
- Color-coded display by child and category
- Pre-populated current time for quick logging

### Food Ratings (Restricted Access)

*Available to: Admin, Chef roles*

- View meal ratings (1-10 scale)
- Overall average rating display
- **Top-rated dishes** ranking
- **Dishes needing improvement** tracking
- Rating history with rater information
- **Food request management**:
  - View and fulfill pending requests
  - Track completed requests
- Color-coded rating badges

### Settings

- **Multi-language support**:
  - English
  - Espanol (Spanish)
  - Chinese
- Language preference persistence

---

## Employee Portal

### My Tasks

- View tasks assigned to you
- Filter by status: Pending, In Progress, Completed
- **Mark tasks complete** or start tasks
- Undo completed tasks
- Summary cards showing task counts

### My Calendar

- Personal calendar view
- See your assigned tasks
- View your approved time-off

### Time-Off Requests

- **Submit leave requests**:
  - PTO (Paid Time Off)
  - Sick Leave
- **Full-day or partial-day** options
- Specify time ranges for partial days
- Add reason/notes
- View request status and admin notes
- Cancel pending requests
- Track historical requests

### Supply Requests

- Submit requests for supplies/items
- Include title, description, and product link
- Track request status
- View admin notes on decisions
- Cancel pending requests

### Menu View

- View weekly menu (read-only)
- **Rate menu items** (1-10 scale)
- Add comments to ratings
- **Request specific dishes**
- Week navigation

### Profile

- View and edit personal information
- Update avatar photo
- Manage contact information
- **Important dates** (visible to admin)
- Emergency contact

### Settings

- Language/locale selection

---

## Shared Features

### Navigation & UI

- **Responsive design** for mobile, tablet, and desktop
- Collapsible sidebar navigation
- User menu with quick actions
- Tab-based interfaces
- Search functionality
- Status badges with color coding
- Avatar displays with fallbacks
- Loading skeletons and states

### Notifications

- Toast notifications for actions
- Confirmation dialogs for destructive actions
- Form validation with error messages

### Internationalization

- Full UI translation in 3 languages
- Dynamic locale switching
- Persistent language preferences

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd household-manager
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env.local
   ```

   Fill in your Supabase credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

4. Run database migrations in Supabase SQL editor (see `/supabase/migrations/`)

5. Start the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000)

### Deployment

Deploy to Vercel:
```bash
npx vercel --prod
```

---

## Project Structure

```
household-manager/
├── app/
│   ├── (admin)/          # Admin portal pages
│   │   ├── dashboard/
│   │   ├── tasks/
│   │   ├── calendar/
│   │   ├── employees/
│   │   ├── leave-requests/
│   │   ├── supply-requests/
│   │   ├── menu/
│   │   ├── logs/
│   │   ├── food-ratings/
│   │   ├── reports/
│   │   └── settings/
│   ├── (employee)/       # Employee portal pages
│   │   ├── my-tasks/
│   │   ├── my-calendar/
│   │   ├── time-off/
│   │   ├── supplies/
│   │   ├── menu/
│   │   ├── food-ratings/
│   │   ├── profile/
│   │   └── settings/
│   ├── (auth)/           # Authentication pages
│   │   ├── login/
│   │   ├── forgot-password/
│   │   └── reset-password/
│   └── api/              # API routes
├── components/
│   ├── ui/               # shadcn/ui components
│   ├── shared/           # Shared components
│   ├── admin/            # Admin-specific components
│   └── employee/         # Employee-specific components
├── hooks/                # Custom React hooks
├── lib/                  # Utilities and configurations
│   ├── supabase/         # Supabase client setup
│   └── validators/       # Zod schemas
├── contexts/             # React contexts
├── types/                # TypeScript types
├── messages/             # i18n translation files
│   ├── en.json
│   ├── es.json
│   └── zh.json
└── supabase/
    └── migrations/       # Database migrations
```

---

## License

Private - All rights reserved.
