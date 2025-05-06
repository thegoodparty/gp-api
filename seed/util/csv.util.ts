import fs from 'fs'
import csv from 'csv-parser'

export async function loadCSV<T>(
  filePath: string,
  timeout?: number,
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const rows: T[] = []

    // Create the stream and pipe it to the CSV parser.
    const stream = fs.createReadStream(filePath)
    const parser = stream.pipe(csv())

    // Conditionally set up a timeout if a timeout duration is provided.
    const timer = timeout
      ? setTimeout(() => {
          console.log('Timeout reached, cancelling CSV stream')
          stream.destroy() // Cancel the underlying read stream.
          resolve(rows)
        }, timeout)
      : null

    parser.on('data', (row) => {
      rows.push(row)
    })

    parser.on('error', (err) => {
      if (timer) clearTimeout(timer)
      reject(err)
    })

    parser.on('end', () => {
      if (timer) clearTimeout(timer)
      console.log('CSV file successfully processed')
      resolve(rows)
    })
  })
}
