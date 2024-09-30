const express = require('express');
const bodyParser = require('body-parser');
const session = require('cookie-session');
const multer = require('multer');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcrypt');

const app = express();
const port = 3000;

// Connect to MongoDB
mongoose.connect('mongodb+srv://abusufiyan3147:fZXqtDNnTVdexiDj@cluster0.dp7wy.mongodb.net/expensetracker?retryWrites=true&w=majority&appName=Cluster0', { useNewUrlParser: true, useUnifiedTopology: true });

// Define User schema
const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
});

// Define Expense schema
const ExpenseSchema = new mongoose.Schema({
    user_id: { type: String, required: true },
    amount: { type: Number, required: true },
    category: String,
    description: String,
    date: Date,
    image: { data: Buffer, contentType: String }, // Store image as binary
});

// Define Income schema
const IncomeSchema = new mongoose.Schema({
    user_id: { type: String, required: true },
    amount: { type: Number, required: true },
    source: String,
    date: Date,
});

// Create models
const User = mongoose.model('User', UserSchema);
const Expense = mongoose.model('Expense', ExpenseSchema);
const Income = mongoose.model('Income', IncomeSchema);

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: process.env.SESSION_SECRET || 'your_secret_key', maxAge: 24 * 60 * 60 * 1000 })); // 1 day

// Middleware to serve static files
app.use('/static', express.static(path.join(__dirname, 'public')));

// Home page (login/signup)
app.get('/', (req, res) => {
    res.render('index');
});

// User Sign-up page
app.get('/signup', (req, res) => {
    res.render('signup');
});

// Handle Sign-up
app.post('/signup', async (req, res) => {
    const email = req.body.email;
    const password = req.body.password;

    try {
        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).send('User already exists.');
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ email, password: hashedPassword });
        await newUser.save();

        req.session.user_id = newUser._id; // Store user ID in session
        res.redirect('/login');
    } catch (error) {
        res.status(400).send(`Error creating account: ${error.message}`);
    }
});

// User login page
app.get('/login', (req, res) => {
    res.render('login');
});

// Handle Login
app.post('/login', async (req, res) => {
    const email = req.body.email;
    const password = req.body.password;

    try {
        // Fetch user document from MongoDB
        const user = await User.findOne({ email });

        if (user) {
            // Check the password
            const isPasswordValid = await bcrypt.compare(password, user.password);

            if (isPasswordValid) {
                req.session.user_id = user._id; // Store user ID in session
                return res.redirect('/dashboard');
            }
        }
        // If user does not exist or password is invalid
        res.status(400).send('Invalid email or password.');
    } catch (error) {
        res.status(400).send(`Error: ${error.message}`);
    }
});

// Dashboard
app.get('/dashboard', async (req, res) => {
    if (!req.session.user_id) {
        return res.redirect('/');
    }

    const user_id = req.session.user_id;

    // Fetch expenses and income from MongoDB
    const expenses = await Expense.find({ user_id }).exec();
    const incomeRecords = await Income.find({ user_id }).exec();

    const total_expenses = expenses.reduce((total, expense) => total + expense.amount, 0);
    const income = incomeRecords.reduce((total, record) => total + (record.amount || 0), 0);
    const balance = income - total_expenses;

    res.render('dashboard', { expenses, balance, income, total_expenses });
});

// Add income
app.post('/add_income', async (req, res) => {
    if (!req.session.user_id) {
        return res.redirect('/');
    }

    const user_id = req.session.user_id;
    const { amount, source, date } = req.body;

    // Store income data in MongoDB
    const income = new Income({
        user_id,
        amount: parseFloat(amount),
        source,
        date: new Date(date),
    });
    await income.save();

    res.redirect('/dashboard');
});

// Setup multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Add expense
app.post('/add_expense', upload.single('image'), async (req, res) => {
    if (!req.session.user_id) {
        return res.redirect('/');
    }

    const user_id = req.session.user_id;
    const { amount, category, description, date } = req.body;
    let image = null;

    if (req.file) {
        image = {
            data: req.file.buffer,
            contentType: req.file.mimetype, // Store content type
        };
    }

    try {
        // Store expense data in MongoDB
        const expense = new Expense({
            user_id,
            amount: parseFloat(amount),
            category,
            description,
            date: new Date(date),
            image,
        });
        await expense.save();

        res.redirect('/dashboard');
    } catch (error) {
        console.error('Error adding expense:', error);
        res.status(500).send(`Error adding expense: ${error.message}`);
    }
});

// Edit expense page
app.get('/edit_expense/:expense_id', async (req, res) => {
    if (!req.session.user_id) {
        return res.redirect('/');
    }

    const expense = await Expense.findById(req.params.expense_id);
    res.render('edit_expense', { expense, expense_id: req.params.expense_id });
});

// Update expense
app.post('/update_expense/:expense_id', upload.single('image'), async (req, res) => {
    if (!req.session.user_id) {
        return res.redirect('/');
    }

    const { amount, category, description } = req.body;
    const updates = { amount: parseFloat(amount), category, description };

    try {
        if (req.file) {
            updates.image = {
                data: req.file.buffer,
                contentType: req.file.mimetype,
            };
        }

        await Expense.findByIdAndUpdate(req.params.expense_id, updates);
        res.redirect('/dashboard');
    } catch (error) {
        console.error('Error updating expense:', error);
        res.status(500).send(`Error updating expense: ${error.message}`);
    }
});

// Handle expense deletion
app.get('/delete_expense/:expense_id', async (req, res) => {
    if (!req.session.user_id) {
        return res.redirect('/');
    }

    try {
        await Expense.findByIdAndDelete(req.params.expense_id);
        res.redirect('/dashboard');
    } catch (error) {
        console.error('Error deleting expense:', error);
        res.status(500).send(`Error deleting expense: ${error.message}`);
    }
});

// Logout
app.get('/logout', (req, res) => {
    req.session.user_id = null;
    res.redirect('/');
});

// Serve image
app.get('/image/:expense_id', async (req, res) => {
    try {
        // Fetch the expense by ID
        const expense = await Expense.findById(req.params.expense_id);

        // Check if the expense and image exist
        if (expense && expense.image) {
            // Set the appropriate content type
            res.set('Content-Type', expense.image.contentType || 'application/octet-stream');
            // Send the binary image data
            res.send(expense.image.data);
        } else {
            // Send a 404 status if not found
            res.status(404).send('Image not found');
        }
    } catch (error) {
        // Handle any errors during fetching
        console.error('Error fetching image:', error);
        res.status(500).send('Internal server error');
    }
});


// Start server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
