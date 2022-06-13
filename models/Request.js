const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const requestSchema = new mongoose.Schema ({
    label: String,
    qid: String,
    fromtime: String,
    totime: String,
    vesselid: String,
    user: String,
    ingestationId: String,
    ingestionDateTime: String,
});

module.exports = requestSchema;