# 🏗️ ADMIN DASHBOARD - TECHNICAL ARCHITECTURE

> Catatan struktur terbaru: file CSS dan JavaScript dashboard telah dipindahkan ke `assets/css/` dan `assets/js/`.

**Developer Documentation & System Design**

---

## 📐 System Architecture

### Overall Structure

```
┌─────────────────────────────────────────────────────────┐
│                  ADMIN DASHBOARD                         │
│                   (Single Page App)                      │
└──────────────────┬──────────────────────────────────────┘
                   │
        ┌──────────┼──────────┐
        │          │          │
        ▼          ▼          ▼
    ┌──────┐  ┌──────┐  ┌──────┐
    │ HTML │  │ CSS  │  │  JS  │
    │      │  │      │  │      │
    │2000+ │  │1000+ │  │1200+ │
    │lines │  │lines │  │lines │
    └──────┘  └──────┘  └──────┘
        │          │          │
        └──────────┼──────────┘
                   │
        ┌──────────▼──────────┐
        │   IndexedDB API     │
        │ (Local Storage)     │
        └────────────────────┘
                   │
        ┌──────────▼──────────┐
        │   Browser Storage   │
        │ (EduSkyLMS Database)│
        └────────────────────┘
```

### Technology Stack

```
Frontend:
├── HTML5 (Semantic, Accessibility)
├── CSS3 (Grid, Flexbox, Responsive)
├── JavaScript ES6+ (Async/Await, Promises)
└── Font Awesome 6.4.0 (Icons)

Storage:
├── Primary: IndexedDB
│   └── NoSQL Document Storage
├── Secondary: localStorage
│   └── Key-Value Storage
└── Fallback: Browser Cache

Features:
├── Responsive Design (Desktop, Tablet, Mobile)
├── Dark Mode Support (CSS Variables)
├── Real-time Search & Filter
├── Modal Forms (CRUD)
├── Data Export/Import (JSON)
└── Local Notifications (Alerts)
```

---

## 📊 Database Schema

### IndexedDB Structure

```javascript
Database: EduSkyLMS
Version: 1

Object Stores:
├── modul
│   ├── keyPath: id (auto-increment)
│   └── indexes: subject
│
├── tugas
│   ├── keyPath: id (auto-increment)
│   └── indexes: modul, deadline
│
├── siswa
│   ├── keyPath: id (auto-increment)
│   └── indexes: email, kelas
│
├── nilaiSiswa
│   ├── keyPath: id (auto-increment)
│   └── indexes: siswaId, tugasId
│
├── kehadiran
│   ├── keyPath: id (auto-increment)
│   └── indexes: siswaId, tanggal
│
└── pengaturan
    ├── keyPath: key
    └── values: system settings
```

### Data Models

#### Modul Object
```javascript
{
  id: Number,                    // Auto-increment
  nama: String,                  // Required
  subject: String,               // Matematika, B.Indo, etc
  deskripsi: String,             // Optional
  aktif: Boolean,                // Default: true
  createdAt: ISO String,         // Auto-set
  updatedAt: ISO String          // Auto-update
}
```

#### Tugas Object
```javascript
{
  id: Number,
  judul: String,                 // Required
  modul: Number,                 // Reference to modul.id
  modulName: String,             // Denormalized
  deadline: Date String,         // YYYY-MM-DD
  nilaiMax: Number,              // Default: 100
  deskripsi: String,
  aktif: Boolean,
  createdAt: ISO String,
  updatedAt: ISO String
}
```

#### Siswa Object
```javascript
{
  id: Number,
  nama: String,                  // Required
  email: String,                 // Required, unique
  kelas: String,                 // Required
  jenisKelamin: String,          // Laki-laki/Perempuan
  nis: String,                   // Optional
  telepon: String,               // Optional
  aktif: Boolean,
  createdAt: ISO String,
  updatedAt: ISO String
}
```

#### NilaiSiswa Object
```javascript
{
  id: Number,
  siswaId: Number,
  tugasId: Number,
  nilai: Number,                 // 0-100
  tanggal: ISO String,
  komentar: String
}
```

#### Kehadiran Object
```javascript
{
  id: Number,
  siswaId: Number,
  tanggal: ISO String,
  status: String,                // Hadir/Alpa/Sakit/Izin
  keterangan: String
}
```

---

## 🔄 CRUD Operations Flow

### Create Flow
```
User Input (Form)
       ↓
Validation (Client-side)
       ↓
Create Object
       ↓
IndexedDB Transaction (readwrite)
       ↓
Success → Alert ✓
     OR
Error → Alert ✗
       ↓
Refresh UI
```

### Read Flow
```
UI Request
    ↓
IndexedDB Transaction (readonly)
    ↓
Get All / Get By ID
    ↓
Return Promise
    ↓
Render in UI (Table/Modal)
```

### Update Flow
```
User Edit Input
    ↓
Validation
    ↓
Fetch Current Data
    ↓
Merge Changes
    ↓
IndexedDB Put Operation
    ↓
Timestamp Update (updatedAt)
    ↓
Refresh UI
```

### Delete Flow
```
User Click Delete
    ↓
Show Confirmation
    ↓
User Confirm
    ↓
IndexedDB Delete Transaction
    ↓
Alert Success
    ↓
Refresh UI
```

---

## 🔌 JavaScript API Reference

### Database Functions

#### Initialization
```javascript
initDatabase()
// Returns: Promise<IDBDatabase>
// Purpose: Open/create IndexedDB database
// Runs: Once on page load
```

#### Modul CRUD
```javascript
addModul(data)           // Add new modul
// data: {nama, subject, deskripsi, aktif}
// Returns: Promise<ID>

updateModul(id, data)    // Update existing modul
// Returns: Promise<void>

deleteModul(id)          // Delete modul
// Requires confirmation
// Returns: Promise<void>

getModul(id)             // Get single modul
// Returns: Promise<Object>

getAllModul()            // Get all modul
// Returns: Promise<Array>
```

#### Tugas CRUD
```javascript
addTugas(data)           // Add new tugas
updateTugas(id, data)    // Update tugas
deleteTugas(id)          // Delete tugas
getAllTugas()            // Get all tugas
```

#### Siswa CRUD
```javascript
addSiswa(data)           // Add new siswa
updateSiswa(id, data)    // Update siswa
deleteSiswa(id)          // Delete siswa
getAllSiswa()            // Get all siswa
```

### UI Functions

#### Rendering
```javascript
renderModulTable(filterText, filterSubject)
renderTugasTable(filterText, filterModul)
renderSiswaTable(filterText)
updateDashboard()
populateModulFilter()
```

#### Navigation
```javascript
navigateTo(page)
// page: 'dashboard', 'modul', 'tugas', etc
// Purpose: Switch page sections
```

#### Modal Control
```javascript
openModal(modalId)       // Show modal
closeModal(modalId)      // Hide modal
showAlert(message, type) // Show notification
```

#### Utilities
```javascript
formatDate(dateString)   // Format date for display
```

---

## 🎨 CSS Architecture

### CSS Variables System
```css
:root {
    /* Colors */
    --primary: #38BDF8;
    --primary-dark: #2563EB;
    --success: #22C55E;
    --warning: #FBBF24;
    --danger: #EF4444;
    
    /* Spacing */
    --radius-md: 12px;
    --radius-lg: 20px;
    
    /* Shadows */
    --shadow-sm: 0 1px 2px...;
    --shadow-md: 0 4px 6px...;
    
    /* Effects */
    --transition: all 0.3s ease;
}
```

### Responsive Breakpoints
```css
/* Desktop */
@media (min-width: 769px) {
    /* 2-column layout */
    .admin-container {
        grid-template-columns: 250px 1fr;
    }
}

/* Tablet */
@media (max-width: 768px) {
    /* 1-column layout */
    /* Collapsible sidebar */
    .admin-sidebar {
        position: fixed;
        left: -250px;
    }
}

/* Mobile */
@media (max-width: 480px) {
    /* Stack everything */
    /* Touch-optimized sizing */
}
```

### Component Classes
```css
/* Layout */
.admin-container      /* Main grid */
.admin-sidebar        /* Left navigation */
.admin-main           /* Content area */
.admin-header         /* Top bar */

/* Cards */
.card                 /* Container */
.stat-card            /* Stat box */
.card-header          /* Card title area */

/* Forms */
.form-group           /* Input wrapper */
.form-row             /* Multi-column form */
.form-actions         /* Button area */

/* Tables */
.table                /* Base table */
.table th/td          /* Headers/cells */
.badge                /* Status badges */

/* Buttons */
.btn                  /* Base button */
.btn-primary/success  /* Color variants */
.btn-sm/block         /* Size variants */

/* Modals */
.modal                /* Overlay */
.modal.active         /* Visible state */
.modal-content        /* Dialog box */
.modal-header         /* Title area */

/* Utilities */
.text-center          /* Centering */
.d-none/d-block       /* Display */
.gap-*                /* Spacing */
```

---

## 🔄 Event Flow

### Page Load
```
1. DOMContentLoaded event fired
2. initDatabase() called
3. Event listeners attached
   - Navigation clicks
   - Form submissions
   - Search inputs
   - Modal controls
4. Dashboard page active
5. updateDashboard() called
6. Stats loaded & displayed
```

### Add Modul Flow
```
1. User clicks "Tambah Modul"
2. openModal('modulModal') called
3. Form cleared
4. Modal becomes visible
5. User fills form
6. User clicks "Simpan Modul"
7. Validation check
8. addModul(data) called
9. IndexedDB transaction
10. Alert shown
11. Modal closed
12. renderModulTable() refreshed
```

### Search Flow
```
1. User types in search box
2. Input event listener triggered
3. getValue() from input
4. renderModulTable(filterText) called
5. getAllModul() fetches data
6. Filter applied: name.includes(filterText)
7. Table tbody re-rendered
8. Displayed: filtered results only
```

---

## 📦 File Organization

### HTML Structure
```
admin.html
├── DOCTYPE & Head
│   ├── Meta tags
│   ├── Font imports
│   ├── CSS link
│   └── Font Awesome
│
├── Body
│   ├── .admin-container
│   │   ├── .admin-sidebar
│   │   │   ├── Logo
│   │   │   └── Nav menu
│   │   │
│   │   └── .admin-main
│   │       ├── .admin-header
│   │       └── .admin-content
│   │           ├── Dashboard page
│   │           ├── Modul page
│   │           ├── Tugas page
│   │           ├── Siswa page
│   │           ├── Profil page
│   │           ├── Laporan page
│   │           └── Pengaturan page
│   │
│   └── Modals
│       ├── modulModal
│       ├── tugasModal
│       └── siswaModal
│
└── Script tag linking admin.js
```

### CSS Organization
```
admin.css
├── Root variables
├── Dark mode variables
├── Base styles (*, body, h1-h6)
├── Layout (grid, flex)
├── Sidebar
├── Header
├── Content sections
├── Cards & stat cards
├── Buttons
├── Forms
├── Tables
├── Modals
├── Tabs
├── Search/filter
├── Alerts
├── Responsive media queries
└── Utilities
```

### JavaScript Organization
```
admin.js
├── Database Management
│   └── initDatabase()
│
├── Modul Functions
│   ├── addModul()
│   ├── updateModul()
│   ├── deleteModul()
│   ├── getModul()
│   └── getAllModul()
│
├── Tugas Functions
│   └── Similar structure
│
├── Siswa Functions
│   └── Similar structure
│
├── Render Functions
│   ├── renderModulTable()
│   ├── renderTugasTable()
│   ├── renderSiswaTable()
│   ├── updateDashboard()
│   └── populateModulFilter()
│
├── Modal Functions
│   ├── openModal()
│   ├── closeModal()
│   ├── editModul()
│   └── editSiswa()
│
├── UI Utilities
│   ├── showAlert()
│   └── formatDate()
│
├── Page Navigation
│   └── navigateTo()
│
└── Event Listeners (DOMContentLoaded)
    ├── Navigation
    ├── Form submissions
    ├── Search/filter
    ├── Modal controls
    └── Settings
```

---

## 🔐 Security Considerations

### Current Implementation
- ✅ Client-side validation
- ✅ Confirmation dialogs for destructive ops
- ✅ localStorage/IndexedDB (browser-isolated)

### Recommendations for Production
```javascript
// Add authentication
- Implement login system
- Store auth token in sessionStorage
- Validate token before operations
- Add role-based access control (RBAC)

// Add validation
- Server-side validation
- Input sanitization
- SQL injection protection (if using DB)
- XSS protection

// Add encryption
- Encrypt sensitive data
- Use HTTPS only
- Implement CORS policy
- Add CSP headers
```

---

## 🚀 Performance Optimization

### Current Optimizations
```javascript
// Database queries
- Use getAll() for bulk operations
- Index on frequently searched fields
- Minimize transaction scope

// UI rendering
- Lazy load tables
- Debounce search input
- Virtual scrolling for large lists

// CSS
- Use CSS Grid (native performance)
- Minimize reflows/repaints
- Hardware-accelerated animations
```

### Future Improvements
```javascript
// Caching
- Implement service workers
- Cache frequently accessed data
- Prefetch common queries

// Pagination
- Implement lazy loading
- Show 10-20 items per page
- Load more on scroll

// Performance Monitoring
- Track operation times
- Log slow queries
- Monitor browser performance
```

---

## 🧪 Testing Guide

### Manual Testing Checklist

#### CRUD Operations
- [ ] Add modul - check saved to DB
- [ ] Edit modul - verify changes persist
- [ ] Delete modul - confirm removal
- [ ] Same for tugas & siswa

#### Search & Filter
- [ ] Search by name - results filter
- [ ] Clear search - all items show
- [ ] Filter by subject - correct results
- [ ] Combine search + filter

#### Forms
- [ ] Submit empty form - validation error
- [ ] Submit valid form - success message
- [ ] Clear form - fields empty
- [ ] Modal close - form state reset

#### Responsive
- [ ] Desktop: 2-column layout
- [ ] Tablet (768px): sidebar collapse
- [ ] Mobile (480px): stacked layout
- [ ] Buttons: touch-friendly size

#### Data Management
- [ ] Export data - JSON file created
- [ ] Import data - records restored
- [ ] Export format - valid JSON
- [ ] Large dataset - performance ok

#### Browser Compatibility
- [ ] Chrome - all features work
- [ ] Firefox - all features work
- [ ] Safari - all features work
- [ ] Edge - all features work

---

## 📝 Development Guidelines

### Code Style
```javascript
// Use const/let (not var)
const modulId = data.id;
let count = 0;

// Use async/await for promises
async function getData() {
    const result = await getAllModul();
    return result;
}

// Use arrow functions
const filtered = data.filter(item => item.active);

// Use template literals
const html = `<div>${item.name}</div>`;

// Use destructuring
const { nama, subject, deskripsi } = modul;
```

### Naming Conventions
```javascript
// Variables: camelCase
let totalModul = 0;
const userName = "Admin";

// Functions: camelCase
function addModul() {}
async function updateSiswa() {}

// Classes: PascalCase (if used)
class Admin {}

// Constants: UPPER_SNAKE_CASE
const MAX_ITEMS = 100;
const DB_NAME = 'EduSkyLMS';
```

### Comments Style
```javascript
// Section comment
// ==========================================
// MODUL FUNCTIONS
// ==========================================

// Function comment
/**
 * Add new modul to database
 * @param {Object} data - Modul data {nama, subject, deskripsi, aktif}
 * @returns {Promise<number>} New modul ID
 */
async function addModul(data) {
    // Implementation comment
    const tx = db.transaction('modul', 'readwrite');
}
```

---

## 🔧 Extending the System

### Add New Feature

#### Step 1: Update Database
```javascript
// In admin.js initDatabase()
if (!db.objectStoreNames.contains('newStore')) {
    db.createObjectStore('newStore', { keyPath: 'id', autoIncrement: true });
}
```

#### Step 2: Create CRUD Functions
```javascript
async function addNewItem(data) {
    const tx = db.transaction('newStore', 'readwrite');
    const store = tx.objectStore('newStore');
    // Implementation...
}
```

#### Step 3: Create Render Function
```javascript
async function renderNewItemTable() {
    const items = await getAllNewItems();
    // Render logic...
}
```

#### Step 4: Add HTML Page
```html
<div class="page-section" id="newItemPage">
    <!-- Content -->
</div>
```

#### Step 5: Add Navigation
```html
<div class="nav-link" data-page="newItem">
    <i class="fas fa-icon"></i>
    <span>New Item</span>
</div>
```

#### Step 6: Add Event Listeners
```javascript
document.getElementById('addNewItemBtn').addEventListener('click', () => {
    // Add logic
});
```

---

## 📊 Database Backup/Restore

### Export
```javascript
async function exportAllData() {
    const modul = await getAllModul();
    const tugas = await getAllTugas();
    const siswa = await getAllSiswa();
    
    return JSON.stringify({ modul, tugas, siswa });
}
```

### Import
```javascript
async function importData(jsonString) {
    const data = JSON.parse(jsonString);
    
    // Add modul
    for (let m of data.modul) {
        await addModul(m);
    }
    
    // Add tugas
    for (let t of data.tugas) {
        await addTugas(t);
    }
    
    // Add siswa
    for (let s of data.siswa) {
        await addSiswa(s);
    }
}
```

---

## 🐛 Debugging Tips

### Browser Console
```javascript
// Check if database is open
console.log(db);

// Get all modul
getAllModul().then(data => console.log(data));

// Check localStorage
console.log(localStorage);

// Check IndexedDB
window.indexedDB.databases();
```

### Common Issues
```javascript
// Issue: Data not saving
// Check: DevTools → Storage → IndexedDB
// Solution: Clear DB and reload

// Issue: Search not working
// Check: console.log(filterText)
// Solution: Verify filter function logic

// Issue: Modal not appearing
// Check: console.log(modal.classList)
// Solution: Verify modal ID and toggle code
```

---

## 📚 Resources

### Browser APIs Used
- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [localStorage API](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
- [Async/Await](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Async_await)
- [DOM API](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model)

### CSS Features
- [CSS Grid](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Grid_Layout)
- [CSS Flexbox](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Flexible_Box_Layout)
- [CSS Variables](https://developer.mozilla.org/en-US/docs/Web/CSS/--*)
- [Media Queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Media_Queries)

---

**Happy Developing! 🚀**

*This documentation helps both users and developers understand and extend the admin system.*

*Last Updated: 14 Juli 2024*
