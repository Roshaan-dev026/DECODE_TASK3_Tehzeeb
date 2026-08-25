const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'tehzeeb_bakers.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL CHECK(price >= 0),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      total REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Received',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER,
      name TEXT NOT NULL,
      price REAL NOT NULL CHECK(price >= 0),
      quantity INTEGER NOT NULL CHECK(quantity >= 1),
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    )
  `);

  const categories = [
    'Bread', 'Cakes', 'Snacks', 'Pizza', 'Biscuits', 'Pastry',
    'Donuts', 'Salad', 'Sandwich', 'Burger', 'Nimko', 'Puff',
    'Beverages', 'Gifting', 'Gifting Hamper'
  ];

  const insertCategory = db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)');
  categories.forEach(name => insertCategory.run(name));
  insertCategory.finalize();

  const products = [
    ['Cakes', 'Coffee Fudge Cake', 2200],
    ['Biscuits', 'Royal Biscuits Box', 950],
    ['Bread', 'Sandwich Loaf', 220],
    ['Pastry', 'Brownie', 280],
    ['Bread', 'Butter Croissant', 260],
    ['Pizza', 'Chicken Tikka Pizza', 1450]
  ];

  const insertProduct = db.prepare(`
    INSERT INTO products (category_id, name, price)
    SELECT id, ?, ? FROM categories WHERE name = ?
    AND NOT EXISTS (SELECT 1 FROM products WHERE name = ?)
  `);
  products.forEach(([category, name, price]) => insertProduct.run(name, price, category, name));
  insertProduct.finalize();
});

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function exec(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, err => {
      if (err) reject(err);
      else resolve();
    });
  });
}

module.exports = { db, run, get, all, exec, dbPath };
