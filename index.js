require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const qs = require("qs");
const admin = require("firebase-admin");
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString("utf-8");
const serviceAccount = JSON.parse(decoded);
const cors = require("cors");
const jwt = require("jsonwebtoken");
const app = express();
const port = process.env.PORT || 3002;

// Middleware to handle SSLCommerz
const axios = require("axios");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

//Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded());

//connect with mongoDB
const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.cykplbd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

//Verify jwt
const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(" ")[1];
  if (!token) return res.status(401).send({ message: "Unauthorized Access" });

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.tokenEmail = decoded?.email;
    next();
  } catch (err) {
    return res.status(401).send({ message: "Unauthorized Access" });
  }
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    const database = client.db("Bookshelf");
    const bookCollections = database.collection("books");
    const ratingCollections = database.collection("ratings");
    const userCollections = database.collection("users");
    const subscriptionCollections = database.collection("subscriptions");

    //Post API to added user in DB
    app.post("/users", async (req, res) => {
      const data = req.body;
      // Set default role as 'user' if not provided
      if (!data.role) {
        data.role = "user";
      }
      data.createdAt = new Date();
      const result = await userCollections.insertOne(data);
      res.send(result);
    });

    // GET api to user exist or not
    app.get("/users/all", async (req, res) => {
      const email = req.query.email;
      if (!email) return res.send({ exists: false });

      const existingUser = await userCollections.findOne({ email: email });
      if (existingUser) {
        res.send({ exists: true });
      } else {
        res.send({ exists: false });
      }
    });

    //Get API to fetch all users
    app.get("/users", async (req, res) => {
      const result = await userCollections.find().toArray();
      res.send(result);
    });

    //Get API to fetch user by email
    app.get("/users/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const tokenEmail = req?.tokenEmail;
      if (tokenEmail !== email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      const result = await userCollections.findOne({ email: email });
      res.send(result);
    });

    //Patch API to update user role (Admin only)
    app.patch("/users/role/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const { role } = req.body;
      const tokenEmail = req?.tokenEmail;

      // Check if requester is admin
      const requester = await userCollections.findOne({ email: tokenEmail });
      if (requester?.role !== "admin") {
        return res.status(403).send({ message: "Forbidden Access: Admin only" });
      }

      const result = await userCollections.updateOne({ email: email }, { $set: { role: role } });
      res.send(result);
    });

    //Patch API to update user profile
    app.patch("/users/:email", async (req, res) => {
      const email = req.params.email;
      const { name, photoURL, phone, location, bio, website, favoriteGenre, readingGoal } = req.body;

      const updateDoc = {
        $set: {
          name: name,
          photoURL: photoURL,
          phone: phone,
          location: location,
          bio: bio,
          website: website,
          favoriteGenre: favoriteGenre,
          readingGoal: readingGoal,
          updatedAt: new Date(),
        },
      };

      const result = await userCollections.updateOne({ email: email }, updateDoc);
      res.send(result);
    });

    // Post API to add a new book
    app.post("/books", verifyJWT, async (req, res) => {
      const data = req.body;
      data.createdAt = new Date();
      const result = await bookCollections.insertOne(data);
      res.send(result);
    });

    //Post API to add a new Rating
    app.post("/ratings", verifyJWT, async (req, res) => {
      const newRating = req.body;
      const result = await ratingCollections.insertOne(newRating);
      if (result.insertedId) {
        res.send({ _id: result.insertedId, ...newRating });
      } else {
        res.status(500).send({ error: "Failed to insert review" });
      }
    });

    //Get All ratings
    app.get("/ratings", async (req, res) => {
      const result = await ratingCollections.find().toArray();
      res.send(result);
    });

    //Get API to fetch book ratings
    app.get("/rating/:bookId", async (req, res) => {
      const id = req.params.bookId;
      const filter = { book_id: id };
      const result = await ratingCollections.find(filter).toArray();
      res.send(result);
    });

    //Patch API to edit Review
    app.patch("/rating/:id", async (req, res) => {
      const { review } = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: { review },
      };
      const result = await ratingCollections.updateOne(filter, updatedDoc);
      res.send({ result, review });
    });

    //Delete Review
    app.delete("/rating/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await ratingCollections.deleteOne(query);
      res.send(result);
    });

    //Get API to fetch all books
    app.get("/books", async (req, res) => {
      const result = await bookCollections.find().toArray();
      res.send(result);
    });

    // Get API to fetch top 6 books sorted by upvotes
    app.get("/books/top", async (req, res) => {
      const result = await bookCollections.find().sort({ upvote: -1 }).limit(5).toArray();
      res.send(result);
    });

    //Get API to fetch books sorted by category
    app.get("/books/category", async (req, res) => {
      const category = req.query.category;
      const filter = category ? { book_category: category } : {};
      const result = await bookCollections.find(filter).toArray();
      res.send(result);
    });

    //Get API to fetch books sorted by category
    app.get("/books/categories/:category", async (req, res) => {
      const category = req.params.category;
      const filter = category ? { book_category: category } : {};
      const result = await bookCollections.find(filter).toArray();
      res.send(result);
    });

    //Get api to How many category in my DB
    app.get("/books/total/category", async (req, res) => {
      const result = await bookCollections
        .aggregate([
          {
            $group: {
              _id: "$book_category",
              count: { $sum: 1 },
            },
          },
          {
            $project: {
              _id: 0,
              category: "$_id",
              count: 1,
            },
          },
        ])
        .toArray();
      res.send(result);
    });

    //Get API to fetch books sorted by Email
    app.get("/books/email", verifyJWT, async (req, res) => {
      const tokenEmail = req?.tokenEmail;
      const email = req.query.email;
      if (tokenEmail !== email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      const filter = email ? { user_email: email } : {};
      const result = await bookCollections.find(filter).toArray();
      res.send(result);
    });

    // Get API to fetch a single book by ID
    app.get("/books/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookCollections.findOne(query);
      res.send(result);
    });

    //Get API to fetch new added books
    app.get("/books/recent/top", async (req, res) => {
      const result = await bookCollections.find().sort({ createdAt: -1 }).limit(5).toArray();
      res.send(result);
    });

    //Put Api for updated book
    app.put("/books/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      const filter = { _id: new ObjectId(id) };
      const doc = {
        $set: {
          book_title: data.book_title,
          cover_photo: data.cover_photo,
          total_page: data.total_page,
          book_author: data.book_author,
          book_category: data.book_category,
          reading_status: data.reading_status,
        },
      };
      const result = await bookCollections.updateOne(filter, doc);
      res.send(result);
    });

    //Patch API to track reading status
    app.patch("/books/status/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const { reading_status } = req.body;
      const result = await bookCollections.updateOne({ _id: new ObjectId(id) }, { $set: { reading_status } });
      res.send(result);
    });

    //Delete API for Delete Book
    app.delete("/books/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookCollections.deleteOne(query);
      res.send(result);
    });

    //Patch API for update upvote value
    app.patch("/books/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = { $inc: { upvote: 1 } };
      const result = await bookCollections.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // SSLCommerz API endpoints
    app.post("/ssl/init-payment", async (req, res) => {
      try {
        const paymentData = req.body;
        const trxId = `TrID${Math.random().toString(36).substring(2, 15)}`;
        paymentData.tran_id = trxId;

        const initiate = {
          store_id: process.env.SSL_STORE_ID,
          store_passwd: process.env.SSL_STORE_PASS,
          total_amount: paymentData.amount,
          currency: paymentData.currency,
          tran_id: trxId,
          success_url: `${process.env.SERVER_BASE_URL}/ssl/ipn`,
          fail_url: `${process.env.SERVER_BASE_URL}/ssl/ipn`,
          cancel_url: `${process.env.SERVER_BASE_URL}/ssl/ipn`,
          ipn_url: `${process.env.SERVER_BASE_URL}/ssl/ipn`,
          shipping_method: "N/A",
          product_name: paymentData.product_name,
          product_category: paymentData.product_category,
          product_profile: "N/A",
          cus_name: paymentData.cus_name,
          cus_email: paymentData.cus_email,
          cus_add1: "Dhaka",
          cus_city: "Dhaka",
          cus_state: "Dhaka",
          cus_postcode: "Dhaka",
          cus_country: "Bangladesh",
          cus_phone: paymentData.cus_phone,
          ship_name: "Dhaka",
          ship_add1: "Dhaka",
          ship_city: "Dhaka",
          ship_state: "Dhaka",
          ship_postcode: "Dhaka",
          ship_country: "Bangladesh",
        };

        // Prepare the request to SSLCommerz
        const response = await axios.post(
          "https://sandbox.sslcommerz.com/gwprocess/v4/api.php",
          qs.stringify(initiate),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
          }
        );

        // Save data to database
        const initData = await subscriptionCollections.insertOne(paymentData);

        res.status(200).json({ GatewayPageURL: response.data.GatewayPageURL });
      } catch (error) {
        console.error("Error initiating SSLCommerz payment:", error);
        res.status(500).json({ error: "Failed to initiate payment" });
      }
    });

    // SSLCommerz IPN (Instant Payment Notification) endpoint
    app.post("/ssl/ipn", async (req, res) => {
      try {
        const ipnData = req.body;

        // Validate the IPN data with SSLCommerz
        const validationUrl = "https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php";

        const validationResponse = await axios.get(
          `${validationUrl}?val_id=${ipnData.val_id}&store_id=${process.env.SSL_STORE_ID}&store_passwd=${process.env.SSL_STORE_PASS}&v=1&format=json`
        );
        if (validationResponse.data?.status !== "VALID") {
          if (ipnData?.status === "CANCELLED") {
            res.redirect(`${process.env.CLIENT_BASE_URL}/subscribe`);
          } else if (ipnData?.status === "FAILED") {
            res.redirect(`${process.env.CLIENT_BASE_URL}/payment/fail`);
          }
          res.status(400).send("Invalid IPN data");
          return;
        }

        // Update user subscription in database
        const subscription = await subscriptionCollections.findOne({
          tran_id: validationResponse.data?.tran_id || "",
        });
        const updatePayment = await subscriptionCollections.updateOne(
          { tran_id: subscription.tran_id || "" },
          { $set: { status: "success" } }
        );

        // Update user role to premium in users collection

        const updateUser = await userCollections.updateOne(
          { email: subscription.cus_email || "" },
          {
            $set: {
              subscription_type: subscription.product_name,
              subscription_status: "active",
              subscription_date: new Date(),
              books_added: subscription.books_added,
            },
          }
        );
        if (updatePayment.modifiedCount && updateUser.modifiedCount) {
          res.redirect(`${process.env.CLIENT_BASE_URL}/payment/success`);
        }
      } catch (error) {
        console.error("Error processing IPN:", error);
        res.status(500).send("Error processing IPN");
      }
    });
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("server run");
});

app.listen(port, () => {
  console.log("server running good");
});
