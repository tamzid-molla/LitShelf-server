require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const admin = require("firebase-admin");
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf-8')
const serviceAccount = JSON.parse(decoded);
const cors = require('cors');
const jwt = require('jsonwebtoken');
const app = express();
const port = process.env.PORT || 3002;


admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

//Middleware
app.use(cors())
app.use(express.json());


//connect with mongoDB
const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.cykplbd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

//Verify jwt 
const verifyJWT = async(req, res, next) => {
  const token = req?.headers?.authorization?.split(" ")[1];
  if (!token) return res.status(401).send({ message: "Unauthorized Access" });

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.tokenEmail = decoded?.email;
    next();
  } catch (err){
    return res.status(401).send({ message: "Unauthorized Access" });
  }
}

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    const database = client.db('Bookshelf');
    const bookCollections = database.collection('books');
    const ratingCollections = database.collection('ratings');
    const userCollections = database.collection('users');

    //Post API to added user in DB
    app.post('/users', async (req, res) => {
      const data = req.body;
      const result = await userCollections.insertOne(data);
      res.send(result);
    })

    // GET api to user exist or not
app.get('/users/all', async (req, res) => {
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
    app.get('/users', async (req, res) => {
      const result = await userCollections.find().toArray();
      res.send(result);
    })


    // Post API to add a new book
    app.post('/books',verifyJWT, async (req, res) => {
      const data = req.body;
      data.createdAt = new Date();
      const result = await bookCollections.insertOne(data);
      res.send(result);
    })

    //Post API to add a new Rating
    app.post('/ratings', verifyJWT, async (req, res) => {
  const newRating = req.body;
  const result = await ratingCollections.insertOne(newRating);
  if (result.insertedId) {
    res.send({ _id: result.insertedId, ...newRating });
  } else {
    res.status(500).send({ error: "Failed to insert review" });
  }
});

    //Get All ratings 
    app.get('/ratings', async (req, res) => {
      const result = await ratingCollections.find().toArray();
      res.send(result)
    })


    //Get API to fetch book ratings
    app.get('/rating/:bookId', async (req, res) => {
      const id = req.params.bookId;
      const filter = { book_id: id };
      const result = await ratingCollections.find(filter).toArray();
      res.send(result)
    }) 

    //Patch API to edit Review
    app.patch('/rating/:id', async (req, res) => {
      const {review} = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {review}
      }
      const result = await ratingCollections.updateOne(filter, updatedDoc);
      res.send({result,review})
    })

    //Delete Review 
    app.delete('/rating/:id',async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await ratingCollections.deleteOne(query);
      res.send(result);
    })

    //Get API to fetch all books
    app.get("/books", async (req, res) => {
      const result = await bookCollections.find().toArray();
      res.send(result);
    })
    
    // Get API to fetch top 6 books sorted by upvotes
    app.get('/books/top', async (req, res) => {
      const result = await bookCollections.find().sort({upvote: -1}).limit(6).toArray();
      res.send(result);
    })
    
    //Get API to fetch books sorted by category
    app.get('/books/category', async (req, res) => {
      const category = req.query.category;
      const filter = category ? { book_category: category } : {};
      const result = await bookCollections.find(filter).toArray();
      res.send(result);
    })

    //Get API to fetch books sorted by category
    app.get('/books/categories/:category',  async (req, res) => {
      const category = req.params.category;
      const filter = category ? { book_category: category } : {};
      const result = await bookCollections.find(filter).toArray();
      res.send(result);
    })

    //Get api to How many category in my DB
    app.get('/books/total/category', async (req, res) => {
       const result = await bookCollections.aggregate([
      {
        $group: {
          _id: "$book_category",
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          category: "$_id",
          count: 1
        }
      }
    ]).toArray();
      res.send(result)
    })

    //Get API to fetch books sorted by Email
    app.get('/books/email', verifyJWT, async (req, res) => {
      const tokenEmail = req?.tokenEmail;
      const email = req.query.email;
      if (tokenEmail !== email) {
         return res.status(403).send({ message: "Forbidden Access" });
      }
      const filter = email ? { user_email: email } : {};
      const result = await bookCollections.find(filter).toArray();
      res.send(result);
    })


    // Get API to fetch a single book by ID
    app.get('/books/:id',verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookCollections.findOne(query);
      res.send(result);
    })

    //Get API to fetch new added books
    app.get('/books/recent/top', async (req, res) => {
      const result = await bookCollections.find().sort({ createdAt: -1 }).limit(6).toArray();
      res.send(result);
    })

    //Put Api for updated book
    app.put('/books/:id',verifyJWT, async (req, res) => {
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
        }
      }
      const result = await bookCollections.updateOne(filter, doc);
      res.send(result)
    })

//Patch API to track reading status
    app.patch('/books/status/:id', verifyJWT, async (req, res) => {
  const id = req.params.id;
  const { reading_status } = req.body;
  const result = await bookCollections.updateOne(
    { _id: new ObjectId(id) },
    { $set: { reading_status } }
  );
  res.send(result);
});


    //Delete API for Delete Book
    app.delete('/books/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookCollections.deleteOne(query);
      res.send(result);
    })


    //Patch API for update upvote value
    app.patch('/books/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = (
        { $inc: { upvote: 1 } }
      )
      const result = await bookCollections.updateOne(filter, updatedDoc);
      res.send(result);
    })

  } finally {
    
    
  }
}
run().catch(console.dir);



app.get('/', (req, res) =>{
    res.send('server run')
})

app.listen(port, () => {
    console.log('server running good');
})