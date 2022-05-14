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
mongoose.main = mongoose.createConnection(MONGO_URL + "UIDB");

const userSchema = require('./models/User');
const User = mongoose.main.model("User", userSchema);

const graphSchema = require('./models/Graph');
const Graph = mongoose.main.model("Graph", graphSchema, "graphs");

const datasetSchema = require('./models/Dataset');
const Dataset = mongoose.main.model("Dataset", datasetSchema, "datasets");
// -----------------------------------------------------------------------------------------------------------

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// Middleware ----------------
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({extended:true}));
app.use(bodyParser.json()); 
app.use(express.static("public"));
app.use(session({
    secret:'diastema',
    resave:false,
    saveUninitialized:false,
    store:MongoStore.create({
        mongoUrl: MONGO_URL+"UIDB",
        collection:'sessions'
    })
}));


// Home route -----------------------------------------------------------------------------------------------------------
app.route("/")
    .get((req,res) => {

        if (req.session.user) {
            res.redirect("/ingestion");
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
                    console.log('[INFO] No user found');
                    res.redirect("/");
                } else {

                    req.session.user = req.body.username;
                    req.session.organization = data[0].organization;

                    res.redirect("/ingestion");
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
            organization: req.body.organization,
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

// Data Ingestion route -----------------------------------------------------------------------------------------------------------
app.route("/ingestion")
    .get((req,res) => {

        if (!req.session.user) {
            res.redirect("/")
        } else {
            res.render("ingestion");
        }

    })
    .post((req,res) => {

        // Generate ingestion id
        const id = Math.random().toString(16).slice(2);

        // Create datetime
        const d = new Date();
        const date = ('0'+d.getDate()).slice(-2) + "-" + ('0'+(d.getMonth()+1)).slice(-2) + "-" + d.getFullYear();
        const time = ('0'+d.getHours()).slice(-2) + ":" + ('0'+d.getMinutes()).slice(-2) + ":" + ('0'+d.getSeconds()).slice(-2) + ":" + d.getMilliseconds()

        const datetime = date + " " + time;

        // Data structure 
        const data = {
            "ingestion-datetime": datetime,
            "diastema-token": "diastema-key",
            "ingestion-id": id.toLowerCase(),
            "database-id": req.session.organization.toLowerCase(),
            "method": req.body.method,
            "link": req.body.link,
            "token": req.body.token,
            "dataset-label": req.body.label.toLowerCase(),
            "user": req.session.user
        }

        // Save data to MongoDB
        const dataset = new Dataset ({
            label: data["dataset-label"],
            ingestationId: data["ingestion-id"],
            ingestionDateTime: data["ingestion-datetime"],
            organization: data["database-id"],
            user: data.user,
            method: data.method,
            link: data.link,
            token: data.token
        });
        dataset.save()
        console.log("[INFO] Dataset information saved to MongoDB!");

        // Send data to Orchestrator
        fetch(ORCHESTRATOR_URL, {
            method: "POST",
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        }).then(res => {
            console.log("[INFO] Ingestion data sent to orchestrator!", res);
        });

        res.redirect("/modelling");
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

        switch (data.message) {

            case "update":
                io.sockets.emit("Modeller", data.update);
                res.sendStatus(200);
                break;

            case "send-to-orchestrator":
                console.log("[INFO] Backend got the data");

                fetch(ORCHESTRATOR_URL, {
                    method: "POST",
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(data.info)
                }).then(res => {
                    console.log("[INFO] Graph data sent to orchestrator!", res);
                });

                res.sendStatus(200); 
                break;

            case "save-graph":

                const graph = new Graph ({
                    user: data.info.metadata.user,
                    name: data.info["analysis-name"],
                    analysisid: data.info["analysis-id"],
                    datetime: data.info["analysis-datetime"],
                    jobs: data.info.jobs,
                    nodes: data.info.nodes,
                    connections: data.info.connections
                });
        
                graph.save()

                console.log("[INFO] Graph saved to MongoDB");

                break;
            
            case "visualize":
                io.sockets.emit("Modeller", "Data ready for visualization, visit the Dashboard");
                res.sendStatus(200); 
                break;

            default:
                console.log("[INFO] No data recieved");
                res.sendStatus(500);
                break;
        }
    });

server.listen(PORT, function () {
    console.log('Started on port 5000');
});