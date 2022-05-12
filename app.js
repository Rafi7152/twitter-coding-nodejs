const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`Db error: ${e.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const getUserQuery = `
    SELECT 
      *
    FROM 
      user
    WHERE
      username = '${username}';`;
  const user = await db.get(getUserQuery);

  if (user !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const newPassword = await bcrypt.hash(password, 10);
      const addUserQuery = `
      INSERT INTO
        user(username,password,name,gender)
      VALUES('${username}','${newPassword}','${name}','${gender}')  `;
      await db.run(addUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `
    SELECT 
      *
    FROM 
      user
    WHERE
      username = '${username}';`;
  const user = await db.get(getUserQuery);
  if (user === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, user.password);
    if (isPasswordMatched === true) {
      const payLoad = { username: username };
      const jwtToken = jwt.sign(payLoad, "hihihihi");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticateDetails = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    const isTokenValid = jwt.verify(
      jwtToken,
      "hihihihi",
      async (error, payLoad) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          request.username = payLoad.username;
          next();
        }
      }
    );
  }
};

app.get("/users/", authenticateDetails, async (request, response) => {
  const getUsersQuery = `
    SELECT 
      *
    FROM 
      user ;`;
  const users = await db.all(getUsersQuery);
  response.send(users);
});

app.get("/likes/", async (request, response) => {
  const getLikeTable = `
    SELECT 
      *
    FROM 
      like;`;
  const likes = await db.all(getLikeTable);
  response.send(likes);
});

app.get(
  "/user/tweets/feed/",
  authenticateDetails,
  async (request, response) => {
    let { username } = request;
    const getUserQuery = `
    SELECT 
      *
    FROM 
      user
    WHERE
      username = '${username}';`;
    const user = await db.get(getUserQuery);
    const getTweetsQuery = `
    SELECT 
      user.username,
      tweet.tweet,
      tweet.date_time AS dateTime
    FROM tweet
      INNER JOIN user ON tweet.user_id = user.user_id
    WHERE 
      tweet_id IN (
          SELECT 
            tweet_id
          FROM tweet 
            INNER JOIN follower ON tweet.user_id = follower.following_user_id
          WHERE  
            follower.follower_user_id = ${user.user_id})
    ORDER BY 
      dateTime DESC
    LIMIT 4  ;`;
    const tweets = await db.all(getTweetsQuery);
    response.send(tweets);
  }
);

app.get("/tweets/", async (request, response) => {
  const getTweets = `
    SELECT  
      *
    FROM 
      tweet;`;
  const tweets = await db.all(getTweets);
  response.send(tweets);
});

app.get("/user/following/", authenticateDetails, async (request, response) => {
  let { username } = request;
  const getUserQuery = `
    SELECT 
      *
    FROM 
      user
    WHERE
      username = '${username}';`;
  const user = await db.get(getUserQuery);
  const getUserNames = `
    SELECT 
      user.name
    FROM follower 
      INNER JOIN user ON follower.following_user_id = user.user_id
    WHERE 
      follower.follower_user_id = '${user.user_id}';`;

  const userNames = await db.all(getUserNames);
  response.send(userNames);
});

app.get("/follower/", async (request, response) => {
  const getFollowerTable = `
    SELECT 
      *
    FROM 
      follower;`;
  const followerTable = await db.all(getFollowerTable);
  response.send(followerTable);
});

app.get("/user/followers/", authenticateDetails, async (request, response) => {
  let { username } = request;
  const getUserQuery = `
    SELECT 
      *
    FROM 
      user
    WHERE
      username = '${username}';`;
  const user = await db.get(getUserQuery);
  const getUserNames = `
    SELECT 
      user.name
    FROM follower 
      INNER JOIN user ON follower.follower_user_id = user.user_id
    WHERE 
      follower.following_user_id = '${user.user_id}';`;

  const userNames = await db.all(getUserNames);
  response.send(userNames);
});

app.get("/tweets/:tweetId/", authenticateDetails, async (request, response) => {
  let { username } = request;
  const { tweetId } = request.params;
  const getUserQuery = `
    SELECT 
      *
    FROM 
      user
    WHERE
      username = '${username}';`;
  const user = await db.get(getUserQuery);

  const checkTweetQuery = `
  SELECT tweet_id
  FROM 
    tweet
  WHERE 
    tweet_id = ${tweetId} AND 
    tweet_id IN(  
     SELECT 
      tweet.tweet_id
    FROM follower 
      INNER JOIN user ON follower.following_user_id = user.user_id
      INNER JOIN tweet ON follower.following_user_id = tweet.user_id
    WHERE 
      follower.follower_user_id = ${user.user_id});`;

  const checkTweet = await db.get(checkTweetQuery);

  if (checkTweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const getTweetLikesRepliesAndDateTime = `
    SELECT 
      tweet.tweet AS tweet,
      COUNT(DISTINCT like.like_id) AS likes,
      COUNT(DISTINCT reply.reply_id) AS replies,
      tweet.date_time AS dateTime
    FROM tweet
      INNER JOIN like ON tweet.tweet_id = like.tweet_id
      INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
    WHERE 
      tweet.tweet_id = ${tweetId};`;
    const tweetLikesRepliesAndDateTime = await db.get(
      getTweetLikesRepliesAndDateTime
    );
    response.send(tweetLikesRepliesAndDateTime);
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateDetails,
  async (request, response) => {
    let { username } = request;
    const { tweetId } = request.params;
    const getUserQuery = `
    SELECT 
      *
    FROM 
      user
    WHERE
      username = '${username}';`;
    const user = await db.get(getUserQuery);

    const checkTweetQuery = `
  SELECT tweet_id
  FROM 
    tweet
  WHERE 
    tweet_id = ${tweetId} AND 
    tweet_id IN(  
     SELECT 
      tweet.tweet_id
    FROM follower 
      INNER JOIN user ON follower.following_user_id = user.user_id
      INNER JOIN tweet ON follower.following_user_id = tweet.user_id
    WHERE 
      follower.follower_user_id = ${user.user_id});`;

    const checkTweet = await db.get(checkTweetQuery);
    if (checkTweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getLikesUsers = `
    SELECT 
      user.username
    FROM like
      INNER JOIN user ON like.user_id = user.user_id
    WHERE 
      like.tweet_id = ${tweetId};`;
      const LikesUsers = await db.all(getLikesUsers);

      let namesArray = [];
      for (let i of LikesUsers) {
        namesArray.push(i.username);
      }
      const result = { likes: namesArray };
      response.send(result);
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateDetails,
  async (request, response) => {
    let { username } = request;
    const { tweetId } = request.params;
    const getUserQuery = `
    SELECT 
      *
    FROM 
      user
    WHERE
      username = '${username}';`;
    const user = await db.get(getUserQuery);

    const checkTweetQuery = `
  SELECT tweet_id
  FROM 
    tweet
  WHERE 
    tweet_id = ${tweetId} AND 
    tweet_id IN(  
     SELECT 
      tweet.tweet_id
    FROM follower 
      INNER JOIN user ON follower.following_user_id = user.user_id
      INNER JOIN tweet ON follower.following_user_id = tweet.user_id
    WHERE 
      follower.follower_user_id = '${user.user_id}');`;
    const checkTweet = await db.get(checkTweetQuery);

    if (checkTweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getRepliesUsers = `
    SELECT 
      user.name,
      reply.reply
    FROM reply
      INNER JOIN user ON reply.user_id = user.user_id
    WHERE 
      reply.tweet_id = ${tweetId};`;
      const repliesUsers = await db.all(getRepliesUsers);
      response.send({ replies: repliesUsers });
    }
  }
);

app.get("/user/tweets/", authenticateDetails, async (request, response) => {
  let { username } = request;
  const getUserQuery = `
    SELECT 
      *
    FROM 
      user
    WHERE
      username = '${username}';`;
  const user = await db.get(getUserQuery);
  const getTweetsQuery = `
    SELECT 
      tweet.tweet AS tweet,
      COUNT(DISTINCT like.like_id) AS likes,
      COUNT(DISTINCT reply.reply_id) AS replies,
      tweet.date_time AS dateTime
    FROM tweet
      INNER JOIN like ON tweet.tweet_id = like.tweet_id
      INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
    WHERE 
      tweet.user_id = ${user.user_id}
    GROUP BY 
      tweet.tweet_id;`;
  const tweets = await db.all(getTweetsQuery);
  response.send(tweets);
});

app.post("/user/tweets/", authenticateDetails, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request;
  const getUserQuery = `
    SELECT 
      *
    FROM 
      user
    WHERE
      username = '${username}';`;
  const user = await db.get(getUserQuery);
  const addTweetQuery = `
  INSERT INTO 
    tweet(tweet,user_id)    
    VALUES('${tweet}',${user.user_id})`;
  await db.run(addTweetQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateDetails,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserQuery = `
    SELECT 
      *
    FROM 
      user
    WHERE
      username = '${username}';`;
    const user = await db.get(getUserQuery);

    const isTweetBelongsToUserQuery = `
    SELECT 
      tweet_id
    FROM 
      tweet 
    WHERE 
      tweet_id = ${tweetId} AND 
      tweet_id IN (     
                SELECT 
                  tweet_id
                FROM 
                  tweet
                WHERE 
                  user_id = ${user.user_id});`;
    const isTweetBelongsToUser = await db.get(isTweetBelongsToUserQuery);

    if (isTweetBelongsToUser === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `
        DELETE 
        FROM 
          tweet
        WHERE 
          tweet_id = ${tweetId};`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

app.get("/reply/", async (request, response) => {
  const getReplyTable = `
    SELECT 
      *
    FROM 
      reply;`;
  const replyTable = await db.all(getReplyTable);
  response.send(replyTable);
});

module.exports = app;
