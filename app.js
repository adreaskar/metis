//jshint esversion:6
const express = require("express");
const bodyParser = require("body-parser");
const socketio = require('socket.io');
const MongoStore = require('connect-mongo');
const mongoose = require("mongoose");
const crypto = require("crypto");
const http = require("http");
const session = require('express-session');
const fetch = require('node-fetch');
const { MONGO_URL, PORT, ORCHESTRATOR_URL } = require("./config/config");

// Database connection -------------------------------------------------------------------------------------
mongoose.main = mongoose.createConnection(MONGO_URL + "metis");

const userSchema = require('./models/User');
const User = mongoose.main.model("User", userSchema);
// -----------------------------------------------------------------------------------------------------------

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// Middleware ----------------
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({extended:true}));
app.use(express.static("public"));
app.use(session({
    secret:'diastema',
    resave:false,
    saveUninitialized:false,
    store:MongoStore.create({
        mongoUrl: MONGO_URL+"metis",
        collection:'sessions'
    })
}));


// Home route -----------------------------------------------------------------------------------------------------------
app.route("/")
    .get((req,res) => {

        if (req.session.user) {
            res.redirect("/modelling");
        } else {
            res.render("index");
        }
    })
    .post((req,res) => {
        req.body.password = crypto.createHash('sha256').update(req.body.password).digest('hex');
        
        User.find({username:req.body.username, password:req.body.password}, (err,data) => {
            if (err) {
                console.log(err);
            } else {
                if (data.length === 0) {
                    console.log('no user found');
                    res.redirect("/");
                } else {

                    req.session.user = req.body.username;

                    res.redirect("/modelling");
                }
            }
        });
    });

// Register route -----------------------------------------------------------------------------------------------------------
app.route("/register")
    .get((req,res) => {
        res.render("register");
    })
    .post((req,res) => {
        req.body.password = crypto.createHash('sha256').update(req.body.password).digest('hex');

        const user = new User ({
            username: req.body.username,
            email: req.body.email,
            password: req.body.password,
            property: req.body.property
        });

        user.save();

        res.redirect("/")
    });

// Logout route -------------------------------------------------------------------------------------------------------------
app.route("/logout")
    .get((req,res) => {
        req.session.destroy((err) => {
            if (err) throw err;
            res.redirect("/")
        });
    });

// Modelling route -----------------------------------------------------------------------------------------------------------
app.route("/modelling")
.get((req,res) => {

    if (!req.session.user) {
        res.redirect("/")
    } else {
        
        req.session.analysisid = Math.random().toString(16).slice(2);

        const username = req.session.user;
        const id = req.session.analysisid;
    
        res.render("modelling", {user:username, id:id});
    }
});

// Messaging route -----------------------------------------------------------------------------------------------------------
app.route("/messages")
    .post((req,res) => {
        let data = req.body;

        // The orchestrator sends updates about finished jobs -----
        if (data.message == "update") {

            io.sockets.emit("Modeller", data.update);

        // The orchestrator sends the message to begin visualization --------
        } else if (data.message == "visualize") {

            io.sockets.emit("Modeller", "Data ready for visualization, visit the Dashboard");
        }
        res.sendStatus(200);
    });

server.listen(PORT, function () {
    console.log('Started on port 5000');
});

io.on("connection", socket => {
    socket.on('send-to-orchestrator', data => {

        fetch(ORCHESTRATOR_URL, {
        	method: "POST",
        	headers: {'Content-Type': 'application/json'}, 
        	body: JSON.stringify(data)
        }).then(res => {
        	console.log("Data sent to orchestrator!", res);
        });

    })
});