// function to extract the username, password, and database name from the database url
// which the docker container needs to run migrations.
export const extractDbCredentials = (dbUrl: string) => {
  const url = new URL(dbUrl)
  const username = url.username
  const password = url.password
  const database = url.pathname.slice(1)
  return { username, password, database }
}
