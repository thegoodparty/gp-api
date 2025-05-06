<p align="center">
  <a href="https://goodparty.org" target="blank"><img src="https://goodparty.org/images/logo-hologram-white.svg" width="120" alt="GoodParty.org Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">The GoodParty.org API built on <a href="http://nodejs.org" target="_blank">Node.js</a>.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[GoodParty.org](https://goodparty.org) API

## Project setup

### Prerequisites

- Be sure to [install Node](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) if you haven't already.
- You will need to be on node `22.12+`
- If you have `nvm` installed, you can run `nvm use` to get the version from the `.nvmrc` file.

### Setup

```bash
$ npm install
```

- Create a Postgres database for the project to connect to. There are many ways to do this, below is an example using Homebrew on macOS:

  ```sh
  # install postgres
  brew install postgresql

  # start a postgres instance
  brew services start postgresql

  # connect to the local db
  psql postgres
  ```

  Inside the psql prompt, create a new database:

  ```sql
  -- create a new database for app
  CREATE DATABASE gpdb;
  -- connect to the new database
  \c gpdb;
  -- create user and password
  CREATE USER postgres WITH PASSWORD 'postgres';
  -- grant all privileges to the user
  GRANT ALL PRIVILEGES ON DATABASE gpdb TO postgres;
  -- allow the user to create databases
  ALTER USER postgres CREATEDB;
  ```

  Enter `\q` to exit the psql prompt and `brew services stop postgresql` to stop the postgres instance. To clean up the local database instance, reinstall with `brew reinstall postgresql`.

- Copy `.env.example` to `.env` and fill in the necessary environment variables.
- Run the following command to create the database tables:

```bash
$ npm run migrate:dev
```

- This also generates the Prisma Client and Typescript types.
- This should also run seeds to populate your local DB with dummy data.

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Swagger / API documentation

- Visit http://localhost:3000/api to see swagger documentation
- Visit http://localhost:3000/api-json to get the JSON openApi representation of swagger config

## Development

### Testing

You can run the tests in the Postman desktop app or you can run them using the Postman CLI in a terminal:

- Install the Postman CLI tool: https://learning.postman.com/docs/postman-cli/postman-cli-installation/#system-requirements
- Generate a Postman API key: https://learning.postman.com/docs/developer/postman-api/authentication/#generate-a-postman-api-key
- Login to Postman CLI: `postman login --with-api-key [API_KEY]`
- Get the IDs of the collection you want to test, and the environment you want to test with from Postman: https://learning.postman.com/docs/postman-cli/postman-cli-options/#signing-in-and-out:~:text=Then%20select%20the%20information%20icon
- Run a collection: `postman run [collection_id] --environment [environment_id]`

(This will eventually be automated to run in a npm/npx script to automatically fetch the collection and environment keys for you)

## Deployment

Check out the README in the [deploy](./deploy) directory for more information on how the project is deployed.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
