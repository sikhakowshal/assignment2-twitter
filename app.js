const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwtToken = authHeader.split(" ")[1];
    if (jwtToken === undefined) {
      response.status(401);
      response.send("Invalid JWT Token");
    } else {
      jwt.verify(jwtToken, "MY_SECRET_TOKEN", (error, payload) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          request.username = payload.username;
          next();
        }
      });
    }
  }
};

//API TO REGISTER A USER
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const getUserQuery = `
        SELECT *
        FROM user
        WHERE username LIKE '${username}';
    `;
  const dbUser = await db.get(getUserQuery);
  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `
                INSERT INTO user (name, username, password, gender)
                VALUES (
                    '${name}',
                    '${username}',
                    '${hashedPassword}',
                    '${gender}'
                );
            `;
      const dbResponse = await db.run(createUserQuery);
      const userId = dbResponse.lastID;
      response.send("User created successfully");
    }
  }
});

//API TO LOGIN USER
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `
        SELECT *
        FROM user
        WHERE username LIKE '${username}';
    `;
  const dbUser = await db.get(getUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    isPasswordChecked = await bcrypt.compare(password, dbUser.password);
    if (isPasswordChecked === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API TO GET TWEETS FOR USER'S FEED
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserDetailsQuery = `
        SELECT *
        FROM user
        WHERE username = '${username}';
      `;
  const dbUser = await db.get(getUserDetailsQuery);
  const userId = dbUser.user_id;
  const getTweetsQuery = `
        SELECT user.username, T.tweet, T.date_time
        FROM (
            follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id
            ) AS T
            INNER JOIN user ON T.following_user_id = user.user_id
        WHERE T.follower_user_id = ${userId}
        ORDER BY tweet.date_time DESC
        LIMIT 4;
      `;
  const convertDbObjectToResponseObject = (dbObject) => {
    return {
      username: dbObject.username,
      tweet: dbObject.tweet,
      dateTime: dbObject.date_time,
    };
  };
  const tweetsArray = await db.all(getTweetsQuery);
  response.send(
    tweetsArray.map((eachArray) => convertDbObjectToResponseObject(eachArray))
  );
});

//API TO GET ALL LIST OF USERS THAT THE USER IS FOLLOWING
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserDetails = `
        SELECT *
        FROM user
        WHERE username = '${username}';
    `;
  const dbUser = await db.get(getUserDetails);
  const userId = dbUser.user_id;
  const getUsersQuery = `
        SELECT user.name
        FROM user INNER JOIN follower ON user.user_id = follower.following_user_id
        WHERE follower.follower_user_id = ${userId};
    `;
  const usersArray = await db.all(getUsersQuery);
  response.send(usersArray);
});

//API TO GET USERS WHO FOLLOWS THE SPECIFIED USER
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserDetails = `
        SELECT *
        FROM user
        WHERE username = '${username}';
    `;
  const dbUser = await db.get(getUserDetails);
  const userId = dbUser.user_id;
  const getUsersQuery = `
    SELECT user.name
    FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id
    WHERE follower.following_user_id = ${userId};
  `;
  const userFollowersArray = await db.all(getUsersQuery);
  response.send(userFollowersArray);
});

//API TO GET TWEETS OF FOLLOWERS OF A USER
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getUserDetails = `
            SELECT *
            FROM user
            WHERE username = '${username}';
        `;
  const dbUser = await db.get(getUserDetails);
  const userId = dbUser.user_id;
  const getTweetsQuery = `
        SELECT T.tweet_id
        FROM (follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id) AS T
            INNER JOIN user ON T.follower_user_id = user.user_id
        WHERE T.follower_user_id = ${userId};
    `;
  const userFollowingTweetsArray = await db.all(getTweetsQuery);
  let isTweetIdMatched;
  for (let eachId of userFollowingTweetsArray) {
    if (Number(tweetId) === eachId.tweet_id) {
      isTweetIdMatched = true;
    } else {
      continue;
    }
  }
  if (isTweetIdMatched === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const getTweetDetailsQuery = `
        SELECT tweet.tweet,
                COUNT (DISTINCT reply.reply_id) as no_of_replies,
                COUNT (DISTINCT like.like_id) as no_of_likes,
                tweet.date_time
        FROM (tweet
        LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id) AS T
        LEFT JOIN like ON T.tweet_id = like.tweet_id
        WHERE T.tweet_id = ${tweetId};
      `;
    const convertDbObjectToResponseObject = (dbObject) => {
      return {
        tweet: dbObject.tweet,
        likes: dbObject.no_of_likes,
        replies: dbObject.no_of_replies,
        dateTime: dbObject.date_time,
      };
    };
    const tweetDetails = await db.get(getTweetDetailsQuery);
    response.send(convertDbObjectToResponseObject(tweetDetails));
  }
});

//API TO GET LIST OF USERNAMES WHO LIKED THE TWEET
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserDetails = `
            SELECT *
            FROM user
            WHERE username = '${username}';
        `;
    const dbUser = await db.get(getUserDetails);
    const userId = dbUser.user_id;
    const getTweetsQuery = `
        SELECT T.tweet_id
        FROM (follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id) AS T
            INNER JOIN user ON T.follower_user_id = user.user_id
        WHERE T.follower_user_id = ${userId};
    `;
    const userFollowingTweetsArray = await db.all(getTweetsQuery);

    let isTweetIdMatched;
    for (let eachId of userFollowingTweetsArray) {
      if (Number(tweetId) === eachId.tweet_id) {
        isTweetIdMatched = true;
      } else {
        continue;
      }
    }
    if (isTweetIdMatched === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getTweetLikedUsersQuery = `
            SELECT user.username
            FROM user JOIN like ON user.user_id = like.user_id
            WHERE like.tweet_id = ${tweetId};
        `;
      const userNamesArray = await db.all(getTweetLikedUsersQuery);
      const responseObject = userNamesArray.map(
        (eachUser) => eachUser.username
      );
      response.send({ likes: responseObject });
    }
  }
);

//API TO GET REPLY OF A USER TWEET WHOM THE USER FOLLOWS
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserDetails = `
            SELECT *
            FROM user
            WHERE username = '${username}';
        `;
    const dbUser = await db.get(getUserDetails);
    const userId = dbUser.user_id;
    const getTweetsQuery = `
        SELECT T.tweet_id
        FROM (follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id) AS T
            INNER JOIN user ON T.follower_user_id = user.user_id
        WHERE T.follower_user_id = ${userId};
    `;
    const userFollowingTweetsArray = await db.all(getTweetsQuery);

    let isTweetIdMatched;
    for (let eachId of userFollowingTweetsArray) {
      if (Number(tweetId) === eachId.tweet_id) {
        isTweetIdMatched = true;
      } else {
        continue;
      }
    }
    if (isTweetIdMatched === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getTweetRepliesQuery = `
            SELECT user.name, reply.reply
            FROM user JOIN reply ON user.user_id = reply.user_id
            WHERE reply.tweet_id = ${tweetId};
        `;
      const tweetRepliesArray = await db.all(getTweetRepliesQuery);
      response.send({ replies: tweetRepliesArray });
    }
  }
);

//API TO GET ALL TWEETS OF A USER
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserDetails = `
            SELECT *
            FROM user
            WHERE username = '${username}';
        `;
  const dbUser = await db.get(getUserDetails);
  const userId = dbUser.user_id;

  const getTweetsQuery = `
        SELECT T.tweet,
                COUNT (DISTINCT reply.reply_id) as no_of_replies,
                COUNT (DISTINCT like.like_id) as no_of_likes,
                T.date_time
        FROM (tweet
         JOIN reply ON tweet.tweet_id = reply.tweet_id) AS T
         JOIN like ON T.tweet_id = like.tweet_id
        GROUP BY T.tweet_id
        HAVING T.user_id = ${userId};
    `;
  const userTweetsArray = await db.all(getTweetsQuery);
  response.send(
    userTweetsArray.map((eachTweet) => ({
      tweet: eachTweet.tweet,
      likes: eachTweet.no_of_likes,
      replies: eachTweet.no_of_replies,
      dateTime: eachTweet.date_time,
    }))
  );
});

//API TO CREATE A POST
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request;
  const getUserQuery = `
        SELECT *
        FROM user
        WHERE username LIKE '${username}';
    `;
  const dbUser = await db.get(getUserQuery);
  const userId = dbUser.user_id;
  let dateTime = new Date();

  const createPostQuery = `
    INSERT INTO tweet (tweet, user_id, date_time)
    VALUES (
        '${tweet}',
        ${userId},
        '${dateTime}'
        );
  `;
  const dbResponse = await db.run(createPostQuery);
  response.send("Created a Tweet");
});

//API TO DELETE A USER'S POST
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserQuery = `
        SELECT tweet.tweet_id
        FROM user JOIN tweet ON user.user_id = tweet.user_id
        WHERE user.username = '${username}';
    `;
    const userTweets = await db.all(getUserQuery);

    let isTweetIdChecked;
    for (let eachTweet of userTweets) {
      if (Number(tweetId) === eachTweet.tweet_id) {
        isTweetIdChecked = true;
      }
    }

    if (isTweetIdChecked === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `
            DELETE FROM tweet
            WHERE tweet_id = ${tweetId};
        `;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
