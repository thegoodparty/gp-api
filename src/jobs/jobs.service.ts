import { Injectable } from '@nestjs/common'
import axios from 'axios'
import { config } from 'dotenv'

config()

const API_BASE = 'https://api.ashbyhq.com/jobPosting'
const ASHBEY_KEY = process.env.ASHBEY_KEY

@Injectable()
export class JobsService {
  async findAll() {
    try {
      const jobs = await fetchJobs('list', { listedOnly: true })
      return jobs || []
    } catch (error) {
      console.error('Error during fetch:', error.message)
      return []
    }
  }

  async findOne(id: string) {
    try {
      const job = await fetchJobs('info', { jobPostingId: id })
      if (!job) {
        return null
      }
      return job
    } catch (error) {
      console.error('Error during fetch:', error.message)
      return null
    }
  }
}

async function fetchJobs(type: string, params?: any) {
  const url = `${API_BASE}.${type}`
  const response = await axios.post(url, params, {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Basic ${Buffer.from(ASHBEY_KEY + ':').toString(
        'base64',
      )}`,
    },
  })
  return response?.data?.results
}
