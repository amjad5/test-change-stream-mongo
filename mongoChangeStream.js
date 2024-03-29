const { MongoClient } = require('mongodb');
const dotenv = require("dotenv");

const { format } = require('date-fns')

dotenv.config()

let changeTypes = {
  INSERT: 'insert',
  UPDATE: 'update',
  REPLACE: 'replace'
}

let collectionTypes = {
  POST: 'post',
  EVENT: 'event',
  GROUP: 'group'
}

const collections = [
  'post',
  'event',
  'group'
]


const client = new MongoClient(
  `mongodb://${process.env.host}/${process.env.defaultDB}?${process.env.connectionOptions}`);

client.connect(err => {
  if (err) {
    console.error('Error connecting to MongoDB:', err);
    return;
  }
  console.log("****** connected to db ******")
});


async function initializeChangeStream() {
  const pipeline = [
    {
      "$match": {
        "$or": collections.map(collection => ({ "ns.coll": collection }))
      }
    }
  ];

  const changeStream = client.watch(pipeline);

  changeStream.on('change', (changeEvent) => {

    console.log("Collection Name: ", changeEvent.ns.coll);

    if (changeEvent.ns.coll == collectionTypes.POST ||
      changeEvent.ns.coll == collectionTypes.EVENT ||
      changeEvent.ns.coll == collectionTypes.GROUP) {
      console.log("function to be callled");
      insertScoreBoardPost(changeEvent);
    }

  });

  changeStream.on('error', (error) => {
    console.error('Change stream error:', error);
  });
}

async function insertScoreBoardPost(changeEvent) {
  if (changeEvent.operationType == changeTypes.INSERT && changeEvent.ns.coll == collectionTypes.POST) {
    console.log('checking post');
    await updateScoreOnCreate(changeEvent.fullDocument, 1, collectionTypes.POST);
  }
  else if (changeEvent.operationType == changeTypes.INSERT && changeEvent.ns.coll == collectionTypes.EVENT) {
    console.log('checking event')
    await updateScoreOnCreate(changeEvent.fullDocument, 2, collectionTypes.EVENT);
  } else if (changeEvent.operationType == changeTypes.INSERT && changeEvent.ns.coll == collectionTypes.GROUP){
    console.log('checking group')
    await updateScoreOnCreate(changeEvent.fullDocument, 2, collectionTypes.GROUP);
  }
}

async function updateScoreOnCreate(insertedDocument, scorePoints, collectionType) {
  // if collection type then userId is user_id else if group then group_own_id else owner_id (for event) 
  const userId =
    (collectionType == collectionTypes.POST) ? (insertedDocument.user_id) :
      ((collectionType == collectionTypes.GROUP) ? (insertedDocument.group_owner_id) :
        (insertedDocument.owner_id))


  console.log("collection: " + collectionType + " score: " + scorePoints + " user_id: " + userId);
  const scoreRecord = await client.db(process.env.defaultDB).collection(process.env.scoreboardCollection).findOne({ user_id: userId });

  if (scoreRecord == null) {
    let initialScoreBoard = getInitialScoreBoard(scorePoints);
    const userProfile = await client.db(process.env.defaultDB).collection(process.env.profileCollection).findOne({ user_id: userId });

    initialScoreBoard.user_id = userId;
    initialScoreBoard.school_id = userProfile.school_id;

    const insertedScore = await client.db(process.env.defaultDB).collection(process.env.scoreboardCollection).insertOne(initialScoreBoard);
    if (insertedScore != null) {
      console.log('inserted successfully!', insertedScore);
      return
    }
  }

  const todayScoreIndex = scoreRecord.daily.findIndex(e => format(e.date, 'dd/MM/yyyy') == format(new Date(), 'dd/MM/yyyy'));
  if (todayScoreIndex == -1) {
    console.log("formated date ", format(new Date(), 'MM/dd/yyyy'))
    scoreRecord.daily.push(
      { date: format(new Date(), 'dd/MM/yyyy'), score: scorePoints }
    )
  } else {
    scoreRecord.daily[todayScoreIndex].score += scorePoints;
  }

  // const updatedScore = 
  await client.db(process.env.defaultDB).collection(process.env.scoreboardCollection).replaceOne(
    { user_id: scoreRecord.user_id },
    scoreRecord
  )
}

function getInitialScoreBoard(scorePoints) {
  const today = format(new Date(), 'dd/MM/yyyy');

  let defaultScoreStructure = {
    user_id: 0,
    school_id: 0,
    country: "usa",
    daily: [
      { date: today, score: scorePoints }
    ],
  }
  return defaultScoreStructure;
}

initializeChangeStream();