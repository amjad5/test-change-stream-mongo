const { MongoClient } = require('mongodb');
const dotenv = require("dotenv");

const { month, startOfMonth, endOfMonth, startOfWeek, endOfWeek, format, getMonth, getYear, getWeek, isSameWeek, isSameMonth } = require('date-fns')

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
    console.log('checking post')
    await updateScoreOnCreate(changeEvent.fullDocument, 1, collectionTypes.POST)
  }
  else if (changeEvent.operationType == changeTypes.INSERT && changeEvent.ns.coll == collectionTypes.EVENT) {
    console.log('checking event')
    await updateScoreOnCreate(changeEvent.fullDocument, 2, collectionTypes.EVENT);
  } else if (changeEvent.operationType == changeTypes.INSERT && changeEvent.ns.coll == collectionTypes.GROUP){
    console.log('checking group')
    await updateScoreOnCreate(changeEvent.fullDocument, 2, collectionTypes.GROUP);
  }

  // switch (changeEvent.operationType) {
    // case changeEvent.operationType == changeTypes.INSERT:
    // break
    // case changeEvent.operationType == changeTypes.UPDATE:
    //   break;
    // case changeEvent.operationType == changeTypes.REPLACE:
    //   break;
  // }
}

async function updateScoreOnCreate(insertedDocument, scorePoints, collectionType) {
  // if collection type then userId is user_id else if group then group_own_id else owner_id (for event) 
  const userId =
    (collectionType == collectionTypes.POST) ? (insertedDocument.user_id) :
      ((collectionType == collectionTypes.GROUP) ? (insertedDocument.group_owner_id) :
        (insertedDocument.owner_id))


  console.log("collection: " + collectionType + " score: " + scorePoints + " user_id: " + userId)
  const scoreRecord = await client.db(process.env.defaultDB).collection(process.env.scoreboardCollection).findOne({ user_id: userId })

  if (scoreRecord == null) {
    let initialScoreBoard = getInitialScoreBoard(scorePoints);
    initialScoreBoard.user_id = userId;
    const insertedScore = await client.db(process.env.defaultDB).collection(process.env.scoreboardCollection).insertOne(initialScoreBoard)
    if (insertedScore != null) {
      console.log('inserted successfully!', insertedScore)
      return
    }
  }

  const todayScoreIndex = scoreRecord.daily.findIndex(e => format(e.date, 'MM/dd/yyyy') == format(new Date(), 'MM/dd/yyyy'));
  if (todayScoreIndex == -1) {
    scoreRecord.daily.push(
      { date: new Date().toISOString(), score: scorePoints }
    )
  } else {
    scoreRecord.daily[todayScoreIndex].score += scorePoints
  }


  const weekScoreIndex = scoreRecord.weekly.findIndex(e => isSameWeek(e.start_date, Date()));
  const startOfWeekDate = startOfWeek(Date()).toISOString()
  const endOfWeekDate = endOfWeek(Date()).toISOString()
  const currentWeekNumber = getWeek(Date())

  if (weekScoreIndex == -1) {
    scoreRecord.weekly.push(
      { week_number: currentWeekNumber, score: scorePoints, streak: 0, start_date: startOfWeekDate, end_date: endOfWeekDate }
    )
  } else {
    scoreRecord.weekly[weekScoreIndex].score += scorePoints
  }


  const startOfMonthDate = startOfMonth(Date()).toISOString()
  const endOfMonthDate = endOfMonth(Date()).toISOString()

  const monthScoreIndex = scoreRecord.monthly.findIndex(e => isSameMonth(e.start_date, Date()));


  if (monthScoreIndex == -1) {
    scoreRecord.monthly.push(
      { month: new Date().getMonth() + 1, start_date: startOfMonthDate, end_date: endOfMonthDate, score: scorePoints, streak: 0 }
    )
  } else {
    scoreRecord.monthly[monthScoreIndex].score += scorePoints
  }



  const yearScoreIndex = scoreRecord.yearly.findIndex(e => e.year == getYear(new Date()));
  if (yearScoreIndex == -1) {
    scoreRecord.yearly.push(
      { date: new Date().toISOString(), score: scorePoints }
    )
  } else {
    scoreRecord.yearly[yearScoreIndex].score += scorePoints
  }


  // const updatedScore = 
  await client.db(process.env.defaultDB).collection(process.env.scoreboardCollection).replaceOne(
    { user_id: scoreRecord.user_id },
    scoreRecord
  )
}

function getInitialScoreBoard(scorePoints) {
  const startOfMonthDate = startOfMonth(Date()).toISOString()
  const endOfMonthDate = endOfMonth(Date()).toISOString()
  const startOfWeekDate = startOfWeek(Date()).toISOString()
  const endOfWeekDate = endOfWeek(Date()).toISOString()
  const today = new Date().toISOString()
  const currentYear = new Date().getFullYear()
  const currentWeekNumber = getWeek(Date())

  let defaultScoreStructure = {
    user_id: 234,
    daily: [
      { date: today, score: scorePoints }
    ],
    weekly: [
      { week_number: currentWeekNumber, score: scorePoints, streak: 0, start_date: startOfWeekDate, end_date: endOfWeekDate }
    ],
    monthly: [
      { month: new Date().getMonth() + 1, start_date: startOfMonthDate, end_date: endOfMonthDate, score: scorePoints, streak: 0 }
    ],
    yearly: [
      { year: currentYear, score: scorePoints, start_date: startOfMonthDate, end_date: endOfMonthDate }
    ]
  }
  return defaultScoreStructure;
}

initializeChangeStream();