 const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { products } = require('./data/products');
const { users } = require('./data/users');
const { orders } = require('./data/orders');
const { authenticateToken } = require('./middleware/auth');

const app = express();
app.use(express.json());

// Welcome route
app.get('/', (req, res) => {
  res.json({ 
    message: '🛒 Welcome to E-commerce API!',
    endpoints: {
      register: 'POST /api/auth/register',
      login: 'POST /api/auth/login',
      products: 'GET /api/products',
      cart: 'GET /api/cart',
      orders: 'GET /api/orders'
    }
  });
});

// ============== USER REGISTRATION & LOGIN ==============

// Register new user
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Check if all fields are provided
    if (!username || !email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Please provide username, email, and password' 
      });
    }

    // Check if user already exists
    const existingUser = users.find(u => u.email === email);
    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        message: 'Email already registered' 
      });
    }

    // Encrypt password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create new user
    const newUser = {
      id: users.length + 1,
      username,
      email,
      password: hashedPassword,
      cart: [],
      createdAt: new Date()
    };
    
    users.push(newUser);
    
    res.status(201).json({ 
      success: true,
      message: 'Registration successful! You can now login',
      user: { 
        id: newUser.id, 
        username: newUser.username, 
        email: newUser.email 
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Check if fields provided
    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Please provide email and password' 
      });
    }

    // Find user
    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    // Create token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ 
      success: true,
      message: 'Login successful!',
      token: token,
      user: { 
        id: user.id, 
        username: user.username, 
        email: user.email 
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// ============== PRODUCTS ==============

// Get all products
app.get('/api/products', (req, res) => {
  res.json({ 
    success: true, 
    count: products.length,
    data: products 
  });
});

// Get one product
app.get('/api/products/:id', (req, res) => {
  const product = products.find(p => p.id === parseInt(req.params.id));
  
  if (!product) {
    return res.status(404).json({ 
      success: false,
      message: 'Product not found' 
    });
  }
  
  res.json({ 
    success: true, 
    data: product 
  });
});

// Search products
app.get('/api/products/search/:query', (req, res) => {
  const query = req.params.query.toLowerCase();
  const results = products.filter(p => 
    p.name.toLowerCase().includes(query) || 
    p.category.toLowerCase().includes(query) ||
    p.description.toLowerCase().includes(query)
  );
  
  res.json({ 
    success: true, 
    count: results.length,
    data: results 
  });
});

// ============== SHOPPING CART (Login Required) ==============

// View cart
app.get('/api/cart', authenticateToken, (req, res) => {
  const user = users.find(u => u.id === req.user.id);
  
  const cartTotal = user.cart.reduce((sum, item) => 
    sum + (item.price * item.quantity), 0
  );
  
  res.json({ 
    success: true, 
    itemCount: user.cart.length,
    total: cartTotal.toFixed(2),
    items: user.cart 
  });
});

// Add to cart
app.post('/api/cart', authenticateToken, (req, res) => {
  const { productId, quantity } = req.body;
  
  if (!productId || !quantity) {
    return res.status(400).json({ 
      success: false,
      message: 'Please provide productId and quantity' 
    });
  }

  const user = users.find(u => u.id === req.user.id);
  const product = products.find(p => p.id === productId);
  
  if (!product) {
    return res.status(404).json({ 
      success: false,
      message: 'Product not found' 
    });
  }
  
  if (product.stock < quantity) {
    return res.status(400).json({ 
      success: false,
      message: `Only ${product.stock} items in stock` 
    });
  }
  
  // Check if already in cart
  const existingItem = user.cart.find(item => item.productId === productId);
  
  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    user.cart.push({
      productId,
      name: product.name,
      price: product.price,
      quantity
    });
  }
  
  res.json({ 
    success: true, 
    message: `${product.name} added to cart`,
    cart: user.cart 
  });
});

// Update cart item quantity
app.put('/api/cart/:productId', authenticateToken, (req, res) => {
  const { quantity } = req.body;
  const productId = parseInt(req.params.productId);
  const user = users.find(u => u.id === req.user.id);
  
  const cartItem = user.cart.find(item => item.productId === productId);
  
  if (!cartItem) {
    return res.status(404).json({ 
      success: false,
      message: 'Item not in cart' 
    });
  }
  
  if (quantity === 0) {
    user.cart = user.cart.filter(item => item.productId !== productId);
    return res.json({ 
      success: true, 
      message: 'Item removed from cart',
      cart: user.cart 
    });
  }
  
  cartItem.quantity = quantity;
  
  res.json({ 
    success: true, 
    message: 'Cart updated',
    cart: user.cart 
  });
});

// Remove from cart
app.delete('/api/cart/:productId', authenticateToken, (req, res) => {
  const productId = parseInt(req.params.productId);
  const user = users.find(u => u.id === req.user.id);
  
  const itemExists = user.cart.find(item => item.productId === productId);
  
  if (!itemExists) {
    return res.status(404).json({ 
      success: false,
      message: 'Item not in cart' 
    });
  }
  
  user.cart = user.cart.filter(item => item.productId !== productId);
  
  res.json({ 
    success: true, 
    message: 'Item removed from cart',
    cart: user.cart 
  });
});

// Clear entire cart
app.delete('/api/cart', authenticateToken, (req, res) => {
  const user = users.find(u => u.id === req.user.id);
  user.cart = [];
  
  res.json({ 
    success: true, 
    message: 'Cart cleared' 
  });
});

// ============== ORDERS (Login Required) ==============

// Create order (checkout)
app.post('/api/orders', authenticateToken, (req, res) => {
  const user = users.find(u => u.id === req.user.id);
  
  if (user.cart.length === 0) {
    return res.status(400).json({ 
      success: false,
      message: 'Your cart is empty' 
    });
  }
  
  // Calculate total
  const total = user.cart.reduce((sum, item) => 
    sum + (item.price * item.quantity), 0
  );
  
  // Create order
  const newOrder = {
    id: orders.length + 1,
    userId: user.id,
    username: user.username,
    items: [...user.cart],
    total: parseFloat(total.toFixed(2)),
    status: 'pending',
    createdAt: new Date()
  };
  
  orders.push(newOrder);
  
  // Update product stock
  user.cart.forEach(cartItem => {
    const product = products.find(p => p.id === cartItem.productId);
    if (product) {
      product.stock -= cartItem.quantity;
    }
  });
  
  // Clear cart
  user.cart = [];
  
  res.status(201).json({ 
    success: true, 
    message: 'Order placed successfully! 🎉',
    order: newOrder 
  });
});

// Get all user's orders
app.get('/api/orders', authenticateToken, (req, res) => {
  const userOrders = orders.filter(o => o.userId === req.user.id);
  
  res.json({ 
    success: true, 
    count: userOrders.length,
    data: userOrders 
  });
});

// Get specific order
app.get('/api/orders/:id', authenticateToken, (req, res) => {
  const order = orders.find(o => 
    o.id === parseInt(req.params.id) && o.userId === req.user.id
  );
  
  if (!order) {
    return res.status(404).json({ 
      success: false,
      message: 'Order not found' 
    });
  }
  
  res.json({ 
    success: true, 
    data: order 
  });
});

// ============== START SERVER ==============

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('═══════════════════════════════════════════');
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log('═══════════════════════════════════════════');
  console.log('\n📚 API Documentation:');
  console.log('\n🔐 Authentication:');
  console.log('  POST /api/auth/register - Register new user');
  console.log('  POST /api/auth/login    - Login');
  console.log('\n🛍️  Products:');
  console.log('  GET  /api/products      - View all products');
  console.log('  GET  /api/products/:id  - View one product');
  console.log('\n🛒 Shopping Cart (requires login):');
  console.log('  GET    /api/cart           - View cart');
  console.log('  POST   /api/cart           - Add to cart');
  console.log('  PUT    /api/cart/:id       - Update quantity');
  console.log('  DELETE /api/cart/:id       - Remove item');
  console.log('\n📦 Orders (requires login):');
  console.log('  POST /api/orders        - Place order');
  console.log('  GET  /api/orders        - View all orders');
  console.log('  GET  /api/orders/:id    - View one order');
  console.log('\n✅ Ready to test in Postman!');
  console.log('═══════════════════════════════════════════\n');
});
