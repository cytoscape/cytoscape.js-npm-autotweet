const getPackageJson = require('package-json');
const moment = require('moment');
const EventEmitter = require('events');
const Twitter = require('twitter');
const process = require('process');
const _ = require('lodash');
const pkgJson = require('./package.json');

let defaults = {
  TIME_SPAN: 1,
  PACKAGES: '',
  TWEET: 'Version {ver} of {pkg} released on npm https://www.npmjs.com/package/{pkg}',
  CONSUMER_KEY: undefined,
  CONSUMER_SECRET: undefined,
  ACCESS_TOKEN_KEY: undefined,
  ACCESS_TOKEN_SECRET: undefined
};

let opts = _.assign( {}, defaults, _.pick( process.env, _.keys( defaults ) ) );

let bus = new EventEmitter();

let isNonemptyString = str => str != null && str !== '' && !str.match(/^\s+$/)

let packages = opts.PACKAGES.split(/\s+/).filter( isNonemptyString );

let lastCheckTime = moment.utc().subtract(parseInt(opts.TIME_SPAN), 'days');

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
      let date = moment.utc( versions.get( ver ) );

      if( date.isAfter( afterDate ) ){
        bus.emit('newver', pkg, ver, afterDate, date);

        return true;
      } else {
        return false;
      }
    } );
  } );
};

let getNewVersions = pkg => {
  return getVersions( pkg, lastCheckTime ).then( vers => {
    if( vers.length === 0 ){
      bus.emit( 'nonewvers', pkg );
    } else {
      bus.emit( 'newvers', pkg, vers );
    }

    return vers;
  } );
};

let getTweetText = ( pkg, ver ) => {
  return opts.TWEET.replace(/\{pkg\}/g, pkg).replace(/\{ver\}/g, ver);
};

let tweetVersion = ( pkg, ver ) => {
  let text = getTweetText( pkg, ver );

  if (process.env.TEST === 'true') {
    console.log("Detected TEST=true mode, so only showing tweet preview instead of posting:");
    console.log(text);
    return;
  }

  return twitterClient.post( 'statuses/update', { status: text } ).then( tweet => {
    bus.emit( 'tweet', pkg, ver, text );

    return tweet;
  } ).catch( err => {
    bus.emit( 'tweeterr', pkg, ver, text, err );

    throw err;
  } );
};

let tweetVersions = ( pkg, vers ) => Promise.all( vers.map( v => tweetVersion( pkg, v ) ) );

let tweetNewReleases = pkg => getNewVersions( pkg ).then( vers => {
  if( vers.length === 0 ){
    return Promise.resolve();
  } else {
    return tweetVersions( pkg, vers );
  }
} );

let schedConf = opts.CRON;

let main = function(){
  let startTime = moment.utc();

  if( packages.length === 0 ){
    console.error('No packages are specified');
    return;
  }

  console.log(`Checking packages for new versions at ${startTime.format()}, with threshold ${lastCheckTime.format()}`);

  Promise.all( packages.map( pkg => {
    return tweetNewReleases( pkg ).catch( err => {
      console.error( err );

      return Promise.resolve();
    } );
  } ) ).then( () => {
    let endTime = moment.utc();

    console.log(`Finished checking packages at ${endTime.format()}`);

    lastCheckTime = startTime;
  } );
};

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

bus.on( 'newvers', (pkg, vers) => {
  console.log(`New versions of ${pkg} : ${vers}`);
} );

bus.on( 'newver', (pkg, ver, afterDate, date) => {
  console.log(`New version ${pkg}@${ver} published at ${date.format()} (after ${afterDate.format()})`);
} );

console.log(`Starting npm-autotweet@${pkgJson.version} with options`);

console.log( JSON.stringify( opts, null, 2 ) );

console.log(`Basing initial check time as ${lastCheckTime.format()}`);

main();
