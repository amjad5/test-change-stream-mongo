



### connect to mongosh and set replicasets as defined below
``` 
mongosh mongo1 --port 27017
conf = { _id: "rs0", members: [{_id: 0, host: "mongo1:27017"}, {_id: 1, host: "mongo2:27018"}, {_id: 2, host: "mongo3:27019"}]}
rs.initiate(conf)
```

 

