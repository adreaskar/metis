const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const datasetSchema = new mongoose.Schema ({
    label: String,
    ingestationId: String,
    ingestionDateTime: String,
    organization: String,
    user: String,
    method: String,
    link: String,
    token: String,
    metis_args: Object
});

module.exports = datasetSchema;