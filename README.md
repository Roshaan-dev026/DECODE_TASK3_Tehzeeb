# Tehzeeb Bakers — Project 2 (Express + SQLite)

Full-stack bakery storefront with a responsive frontend and an Express REST API backed by SQLite.

## Run

```bash
npm install
npm start
```

Open `http://localhost:3000`.

The SQLite database is created automatically at `./db/tehzeeb_bakers.sqlite` on first start.

## Database

Tables:

- `categories` — allowed product categories
- `products` — bakery products
- `orders` — customer orders
- `order_items` — individual order lines

`order_items.order_id` uses `ON DELETE CASCADE`, so deleting an order also deletes its items.

## API

### Products CRUD

- `GET /api/products` — all products
- `GET /api/products/:id` — one product
- `POST /api/products` — create product
- `PUT /api/products/:id` — update product
- `DELETE /api/products/:id` — delete product

Product JSON:

```json
{
  "name": "Chocolate Cake",
  "price": 1800,
  "category": "Cakes"
}
```

### Orders

- `POST /api/orders` — create an order and its order items in one SQLite transaction
- `GET /api/orders` — all orders with items
- `GET /api/orders/:id` — one order with items
- `PUT /api/orders/:id/status` — update order status
- `DELETE /api/orders/:id` — delete an order; order items cascade-delete

Example order:

```json
{
  "name": "Ali",
  "phone": "03001234567",
  "email": "ali@example.com",
  "category": "Cakes",
  "message": "Deliver to Main Road, Attock",
  "items": [
    { "product_id": 1, "quantity": 2 }
  ]
}
```

The API also accepts the frontend's existing item format using `name`, `price`, `qty`, and optional `category`.

### Categories

- `GET /api/categories` — all valid categories

### Health

- `GET /api/health` — confirms the SQLite connection

## Requirements covered

- Express server
- SQLite database connection via `./db`
- Static `public` folder
- Product CRUD: GET all, GET by ID, POST, PUT, DELETE
- Product validation
- Category validation using the `categories` table
- Order creation
- Order items stored separately
- SQLite transaction for orders (`BEGIN`, `COMMIT`, `ROLLBACK`)
- GET all orders
- GET order by ID
- Update order status
- Delete orders
- `ON DELETE CASCADE` for order items
- JSON request handling
- `PORT` configuration for deployment
- Parameterized SQL queries (`?` placeholders)
