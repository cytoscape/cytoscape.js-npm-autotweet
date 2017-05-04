# npm-autotweet

Automatically tweets new releases for your npm packages to your twitter account.

## Usage

1. `git clone` this project (easily done with Heroku)
1. Set the following environment variables
    1. `BIND` and `PORT` (optional) : When `BIND` is a truthy value, an http server is bound on `PORT`.  This is useful for deploying to systems like Heroku, which will kill the server if nothing is bound to `process.env.PORT`.
    1. `START_TIME` (optional) : A date string or int.  Packages released after this date are tweeted.  By default, the current time is used.  This value is automatically updated on each tweet cycle to avoid duplicates.
    1. `PACKAGES` : A space-separated list of npm package names to be tweeted.
    1. `CRON` (optional) : A cron-style schedule string that controls tweet cycle scheduling.  By
  default, `*/5 * * * *` is used (every 5 minutes).
    1. `TWEET` (optional) : The tweet template.  You can use `{ver}` for the package version and `{pkg}` for the package name in the template.  By default, `Version {ver} of {pkg} released on npm https://www.npmjs.com/package/{pkg}` is used.
    1. Twitter auth keys and secrets must be specified.  Create your app keys and tokens at https://apps.twitter.com/
        1. `CONSUMER_KEY`
        1. `CONSUMER_SECRET`
        1. `ACCESS_TOKEN_KEY`
        1. `ACCESS_TOKEN_SECRET`
