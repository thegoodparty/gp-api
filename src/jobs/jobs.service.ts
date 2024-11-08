import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { config } from 'dotenv';

config();

const API_BASE = 'https://api.ashbyhq.com/jobPosting';
const ASHBEY_KEY = process.env.ASHBEY_KEY;

@Injectable()
export class JobsService {
  async findAll() {
    const url = `${API_BASE}.list?`;

    try {
      const response = await axios.post(
        url,
        { listedOnly: true },
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Basic ${Buffer.from(ASHBEY_KEY + ':').toString(
              'base64',
            )}`,
          },
        },
      );
      if (response?.data && response?.data?.results) {
        const jobs = response.data.results;
        return jobs;
      } else {
        console.error(
          'Failed to fetch data:',
          response.status,
          response.statusText,
        );
        return [];
      }
    } catch (error) {
      console.error('Error during fetch:', error.message);
      return [];
    }
  }

  findOne(id: number) {
    return `This action returns a #${id} job`;
  }
}
