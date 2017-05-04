const Promise = require('bluebird');
const getPackageJson = require('package-json');
const moment = require('moment');
const schedule = require('node-schedule');
const EventEmitter = require('events');
const Twitter = require('twitter');
const process = require('process');
const _ = require('lodash');
const http = require('http');
const pkgJson = require('./package.json');

let defaults = {
  START_TIME: '',
  PACKAGES: '',
  CRON: '*/5 * * * *',
  TWEET: 'Version {ver} of {pkg} released on npm https://www.npmjs.com/package/{pkg}',
  BIND: '',
  PORT: 3000,
  CONSUMER_KEY: undefined,
  CONSUMER_SECRET: undefined,
  ACCESS_TOKEN_KEY: undefined,
  ACCESS_TOKEN_SECRET: undefined
};

let opts = _.assign( {}, defaults, _.pick( process.env, _.keys( defaults ) ) );

let bus = new EventEmitter();

let dateFormat = 'YYYY-MM-DD HH:mm:ss';

let isNonemptyString = str => str != null && str !== '' && !str.match(/^\s+$/)

let packages = opts.PACKAGES.split(/\s+/).filter( isNonemptyString );

let lastCheckTime = opts.START_TIME ? moment( opts.START_TIME ) : moment().subtract(1, 'day');

let twitterClient = new Twitter({
  consumer_key: opts.CONSUMER_KEY,
  consumer_secret: opts.CONSUMER_SECRET,
  access_token_key: opts.ACCESS_TOKEN_KEY,
  access_token_secret: opts.ACCESS_TOKEN_SECRET
});

let getVersions = ( pkg, afterDate ) => {
  return getPackageJson(pkg, { allVersions: true, fullMetadata: true }).then( json => {
    let versions = new Map( (() => {
      let isRealVersion = v => v !== 'created' && v !== 'modified';
      let keys = Object.keys( json.time ).filter( isRealVersion );

      return keys.map( k => [ k, json.time[k] ] );
    })() );

    return Array.from( versions.keys() ).filter( ver => {
      let date = moment( versions.get( ver ) );

      return date.isAfter( afterDate );
    } );
  } );
};

let getNewVersions = pkg => {
  return getVersions( pkg, lastCheckTime ).then( vers => {
    if( vers.length === 0 ){
      bus.emit( 'nonewvers', pkg );
    }

    return vers;
  } );
};

let getTweetText = ( pkg, ver ) => {
  return opts.TWEET.replace(/\{pkg\}/g, pkg).replace(/\{ver\}/g, ver);
};

let tweetVersion = ( pkg, ver ) => {
  let text = getTweetText( pkg, ver );

  return twitterClient.post( 'statuses/update', { status: text } ).then( tweet => {
    bus.emit( 'tweet', pkg, ver, text );

    return tweet;
  } ).catch( err => {
    bus.emit( 'tweeterr', pkg, ver, text, err );

    throw err;
  } );
};

let tweetVersions = ( pkg, vers ) => Promise.all( vers.map( v => tweetVersion( pkg, v ) ) );

let tweetNewReleases = pkg => getNewVersions( pkg ).then( vers => tweetVersions( pkg, vers ) );

let schedConf = opts.CRON;

bus.on( 'tweet', ( pkg, ver, text ) => {
  console.log(`Tweet ${pkg}@${ver} : ${text}`);
} );

bus.on( 'tweeterr', ( pkg, ver, text, err ) => {
  console.log(`Tweet failed for ${pkg}@${ver} : ${text}`);
  console.error( err );
} );

bus.on( 'nonewvers', pkg => {
  console.log(`No new versions found for ${pkg}`);
} );

console.log(`Starting npm-autotweet@${pkgJson.version} with options`);

console.log( JSON.stringify( opts, null, 2 ) );

console.log(`Basing initial check time as ${lastCheckTime.format( dateFormat )}`);

schedule.scheduleJob( schedConf, function(){
  let startTime = moment();

  if( packages.length === 0 ){
    console.error('No packages are specified');
    return;
  }

  console.log(`Checking packages for new versions at ${startTime.format( dateFormat )}`);

  Promise.all( packages.map( tweetNewReleases ) ).then( () => {
    let endTime = moment();

    console.log(`Finished checking packages at ${endTime.format( dateFormat )}`);

    lastCheckTime = startTime;
  } );
} );

if( opts.BIND ){
  console.log(`Binding http server to port ${opts.PORT}`);

  let server = http.createServer( ( req, res ) => {
    res.end();
  } );

  server.listen( opts.PORT );
}
