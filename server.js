const express = require('express');
const path = require('path');
const { db, run, get, all, exec } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const ALLOWED_STATUSES = ['Received', 'Preparing', 'Ready', 'Delivered', 'Cancelled'];

function validateProduct(body) {
  const errors = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return ['Request body must be a JSON object.'];
  }
  if (typeof body.name !== 'string' || body.name.trim().length < 2) {
    errors.push('Product name must contain at least 2 characters.');
  }
  if (!Number.isFinite(Number(body.price)) || Number(body.price) < 0) {
    errors.push('Product price must be a non-negative number.');
  }
  if (typeof body.category !== 'string' || !body.category.trim()) {
    errors.push('Category is required.');
  }
  return errors;
}

function validateOrder(body) {
  const errors = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return ['Request body must be a JSON object.'];
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const category = typeof (body.category || body.item) === 'string'
    ? (body.category || body.item).trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (name.length < 2) errors.push('Name must contain at least 2 characters.');
  if (!/^[0-9+\-\s]{7,15}$/.test(phone)) errors.push('Phone number is invalid.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Email address is invalid.');
  if (!category) errors.push('Product category is required.');
  if (message.length < 8) errors.push('Delivery address/notes must contain at least 8 characters.');
  if (!Array.isArray(body.items) || body.items.length === 0) errors.push('Items must be a non-empty array.');

  if (Array.isArray(body.items)) {
    body.items.forEach((item, index) => {
      if (!item || typeof item !== 'object') {
        errors.push(`Item ${index + 1} is invalid.`);
        return;
      }
      if (item.product_id !== undefined && (!Number.isInteger(Number(item.product_id)) || Number(item.product_id) < 1)) {
        errors.push(`Item ${index + 1} has an invalid product_id.`);
      }
      if (typeof item.name !== 'string' && item.product_id === undefined) {
        errors.push(`Item ${index + 1} must have a name or product_id.`);
      }
      if (item.price !== undefined && (!Number.isFinite(Number(item.price)) || Number(item.price) < 0)) {
        errors.push(`Item ${index + 1} has an invalid price.`);
      }
      const qty = item.quantity ?? item.qty;
      if (!Number.isInteger(Number(qty)) || Number(qty) < 1) {
        errors.push(`Item ${index + 1} has an invalid quantity.`);
      }
    });
  }
  return errors;
}

async function getCategory(categoryName) {
  return get('SELECT id, name FROM categories WHERE lower(name) = lower(?)', [categoryName]);
}

async function getProductWithCategory(id) {
  return get(`
    SELECT p.id, p.name, p.price, c.id AS category_id, c.name AS category,
           p.created_at, p.updated_at
    FROM products p
    JOIN categories c ON c.id = p.category_id
    WHERE p.id = ?
  `, [id]);
}

async function getOrderWithItems(id) {
  const order = await get('SELECT * FROM orders WHERE id = ?', [id]);
  if (!order) return null;
  order.items = await all(`
    SELECT id, product_id, name, price, quantity, price * quantity AS subtotal
    FROM order_items
    WHERE order_id = ?
    ORDER BY id
  `, [id]);
  return order;
}

// ---------- Products CRUD ----------
app.get('/api/products', async (req, res) => {
  try {
    const products = await all(`
      SELECT p.id, p.name, p.price, c.name AS category,
             p.created_at, p.updated_at
      FROM products p
      JOIN categories c ON c.id = p.category_id
      ORDER BY p.id
    `);
    res.json({ success: true, count: products.length, data: products });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await getProductWithCategory(Number(req.params.id));
    if (!product) return res.status(404).json({ success: false, error: 'Product not found.' });
    res.json({ success: true, data: product });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/products', async (req, res) => {
  const errors = validateProduct(req.body);
  if (errors.length) return res.status(400).json({ success: false, errors });

  try {
    const category = await getCategory(req.body.category.trim());
    if (!category) return res.status(400).json({ success: false, errors: ['Invalid category.'] });

    const result = await run(
      'INSERT INTO products (category_id, name, price) VALUES (?, ?, ?)',
      [category.id, req.body.name.trim(), Number(req.body.price)]
    );
    const product = await getProductWithCategory(result.id);
    res.status(201).json({ success: true, data: product });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/products/:id', async (req, res) => {
  const errors = validateProduct(req.body);
  if (errors.length) return res.status(400).json({ success: false, errors });

  try {
    const existing = await getProductWithCategory(Number(req.params.id));
    if (!existing) return res.status(404).json({ success: false, error: 'Product not found.' });

    const category = await getCategory(req.body.category.trim());
    if (!category) return res.status(400).json({ success: false, errors: ['Invalid category.'] });

    await run(`
      UPDATE products
      SET category_id = ?, name = ?, price = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [category.id, req.body.name.trim(), Number(req.body.price), Number(req.params.id)]);

    res.json({ success: true, data: await getProductWithCategory(Number(req.params.id)) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const result = await run('DELETE FROM products WHERE id = ?', [Number(req.params.id)]);
    if (!result.changes) return res.status(404).json({ success: false, error: 'Product not found.' });
    res.json({ success: true, message: 'Product deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Orders ----------
app.post('/api/orders', async (req, res) => {
  const errors = validateOrder(req.body);
  if (errors.length) return res.status(400).json({ success: false, errors });

  try {
    const body = req.body;
    const category = (body.category || body.item).trim();
    const categoryRow = await getCategory(category);
    if (!categoryRow) return res.status(400).json({ success: false, errors: ['Invalid product category.'] });

    const preparedItems = [];
    for (const item of body.items) {
      let product = null;
      if (item.product_id !== undefined) {
        product = await getProductWithCategory(Number(item.product_id));
        if (!product) return res.status(400).json({ success: false, errors: [`Product ${item.product_id} does not exist.`] });
      }

      const quantity = Number(item.quantity ?? item.qty);
      const name = product ? product.name : item.name.trim();
      const price = product ? Number(product.price) : Number(item.price);
      const itemCategory = product ? product.category : (item.category || category);

      const itemCategoryRow = await getCategory(itemCategory);
      if (!itemCategoryRow) {
        return res.status(400).json({ success: false, errors: [`Invalid category for item ${name}.`] });
      }

      preparedItems.push({
        productId: product ? product.id : null,
        name,
        price,
        quantity
      });
    }

    const total = preparedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

    await exec('BEGIN TRANSACTION');
    try {
      const orderResult = await run(`
        INSERT INTO orders (name, phone, email, category, message, total, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [body.name.trim(), body.phone.trim(), body.email.trim(), category, body.message.trim(), total, 'Received']);

      for (const item of preparedItems) {
        await run(`
          INSERT INTO order_items (order_id, product_id, name, price, quantity)
          VALUES (?, ?, ?, ?, ?)
        `, [orderResult.id, item.productId, item.name, item.price, item.quantity]);
      }

      await exec('COMMIT');
      const order = await getOrderWithItems(orderResult.id);
      return res.status(201).json({
        success: true,
        message: 'Your order has been created.',
        order
      });
    } catch (transactionError) {
      await exec('ROLLBACK').catch(() => {});
      throw transactionError;
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    const orders = await all('SELECT * FROM orders ORDER BY id DESC');
    for (const order of orders) {
      order.items = await all(`
        SELECT id, product_id, name, price, quantity, price * quantity AS subtotal
        FROM order_items WHERE order_id = ? ORDER BY id
      `, [order.id]);
    }
    res.json({ success: true, count: orders.length, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const order = await getOrderWithItems(Number(req.params.id));
    if (!order) return res.status(404).json({ success: false, error: 'Order not found.' });
    res.json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/orders/:id/status', async (req, res) => {
  const status = typeof req.body?.status === 'string' ? req.body.status.trim() : '';
  if (!ALLOWED_STATUSES.includes(status)) {
    return res.status(400).json({
      success: false,
      error: `Invalid status. Use: ${ALLOWED_STATUSES.join(', ')}.`
    });
  }

  try {
    const result = await run('UPDATE orders SET status = ? WHERE id = ?', [status, Number(req.params.id)]);
    if (!result.changes) return res.status(404).json({ success: false, error: 'Order not found.' });
    res.json({ success: true, data: await getOrderWithItems(Number(req.params.id)) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/orders/:id', async (req, res) => {
  try {
    const result = await run('DELETE FROM orders WHERE id = ?', [Number(req.params.id)]);
    if (!result.changes) return res.status(404).json({ success: false, error: 'Order not found.' });
    res.json({ success: true, message: 'Order deleted. Its order items were cascade-deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/categories', async (req, res) => {
  try {
    const categories = await all('SELECT id, name FROM categories ORDER BY name');
    res.json({ success: true, data: categories });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    await get('SELECT 1 AS ok');
    res.json({ success: true, database: 'SQLite connected' });
  } catch (err) {
    res.status(500).json({ success: false, database: 'SQLite unavailable', error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Tehzeeb Bakers Project 2 running at http://localhost:${PORT}`);
});
