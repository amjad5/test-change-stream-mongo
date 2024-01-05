const { MongoClient } = require('mongodb');

async function initializeChangeStream() {
  // const client = new MongoClient('mongodb://localhost:30001?directConnection=true',
  const client = new MongoClient('mongodb://127.0.0.1:27017/?directConnection=true&serverSelectionTimeoutMS=2000',
  );

  await client.connect();

  const sourceCollection = client.db('o2geeks').collection('post');
  const targetCollection = client.db('o2geeks').collection('board');

  const changeStream = sourceCollection.watch();

  changeStream.on('change', (changeEvent) => {
    if (changeEvent.operationType === 'insert') {
      console.log("post: insert detected", changeEvent.fullDocument)
      const insertedDocument = changeEvent.fullDocument;

      updateTargetCollection(targetCollection, insertedDocument);
    }

    if (changeEvent.operationType === 'update') {
      console.log("post: update detected", changeEvent.fullDocument)

    }
  });
}

async function updateTargetCollection(targetCollection, insertedDocument) {
  console.log({ user_id: insertedDocument.user_id })
  await targetCollection.updateOne(
    { user_id: insertedDocument.user_id },
    { $inc: { score: 1 } }
  );
}

initializeChangeStream();