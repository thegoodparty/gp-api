import { HttpService } from '@nestjs/axios'
import { Injectable } from '@nestjs/common'
import { firstValueFrom } from 'rxjs'
import {
  VoterCounts,
  PartisanCounts,
  GenderCounts,
  EthnicityCounts,
  VoterHistoryColumn,
} from './voters.types'
import lodash from 'lodash'
import { Logger } from '@nestjs/common'

const API_BASE = 'https://api.l2datamapping.com/api/v2'
const L2_DATA_KEY = process.env.L2_DATA_KEY

@Injectable()
export class VotersService {
  private readonly logger = new Logger(VotersService.name)
  constructor(private readonly httpService: HttpService) {}

  async getVoterCounts(
    electionTerm: number,
    electionDate: string,
    electionState: string,
    electionType: string,
    electionLocation: string,
    partisanType: string,
    priorElectionDates: string[],
  ): Promise<VoterCounts> {
    let searchJson = {
      filters: {},
    }

    if (electionType && electionType !== '') {
      searchJson.filters[electionType] = electionLocation
    }

    // sleep for 5 seconds to avoid rate limiting.
    await new Promise((resolve) => setTimeout(resolve, 5000))
    let partisanCounts: PartisanCounts = await this.getPartisanCounts(
      electionState,
      searchJson,
    )
    this.logger.log('partisanCounts', partisanCounts)

    if (partisanCounts.total === 0) {
      // don't get electionHistory if we don't have a match.
      this.logger.log('no partisanCounts found')
      return partisanCounts
    }

    // sleep for 5 seconds to avoid rate limiting.
    await new Promise((resolve) => setTimeout(resolve, 5000))
    let genderCounts: GenderCounts = await this.getGenderCounts(
      electionState,
      searchJson,
    )
    this.logger.log('genderCounts', genderCounts)

    // sleep for 5 seconds to avoid rate limiting.
    await new Promise((resolve) => setTimeout(resolve, 5000))
    let ethnicityCounts: EthnicityCounts = await this.getEthnicityCounts(
      electionState,
      searchJson,
    )
    this.logger.log('ethnicityCounts', ethnicityCounts)

    let counts: VoterCounts = {
      ...partisanCounts,
      ...genderCounts,
      ...ethnicityCounts,
    }

    // Now we try to determine the turnout for the last 3 elections.
    // with the goal to determine averageTurnout and projectedTurnout

    // sleep for 5 seconds to avoid rate limiting.
    await new Promise((resolve) => setTimeout(resolve, 5000))
    let columns = await this.getColumns(electionState)

    let numberOfElections = 3
    // if (electionTerm >= 4) {
    //   // for longer terms we only want to look at the last 2 elections. (deprecated)
    //   numberOfElections = 2;
    // }

    let partisanRace = false

    if (
      electionType === 'State_House_District' ||
      electionType === 'State_Senate_District' ||
      electionType === 'US_House_District' ||
      electionType === 'US_Senate' ||
      partisanType === 'partisan'
    ) {
      partisanRace = true
    }
    this.logger.log('partisanRace', partisanRace)
    let electionDates: any[] | undefined
    if (partisanRace) {
      // update the electionDate to the first Tuesday of November.
      let year = electionDate.split('-')[0]
      const electionDateObj = this.getFirstTuesdayOfNovember(year)
      electionDate = electionDateObj.toISOString().slice(0, 10)
      this.logger.log('updated electionDate to GE date:', electionDate)
    } else {
      electionDates = priorElectionDates
    }

    let foundColumns: VoterHistoryColumn[] = []
    if (electionDates && electionDates.length > 0) {
      for (let y = 0; y < electionDates.length; y++) {
        // if we know the prior election Dates we use those,
        let columnResults: VoterHistoryColumn | undefined =
          this.determineHistoryColumn(
            electionDate,
            electionState,
            electionTerm * (y + 1),
            columns,
            partisanRace,
            electionDates[y],
          )
        this.logger.log('columnResults', columnResults)
        if (columnResults?.column) {
          foundColumns.push(columnResults)
        }
      }
    } else {
      for (let y = 0; y < numberOfElections; y++) {
        // otherwise we have to guess on the prior election dates.
        let columnResults: VoterHistoryColumn | undefined =
          this.determineHistoryColumn(
            electionDate,
            electionState,
            electionTerm * (y + 1),
            columns,
            partisanRace,
            undefined,
          )
        this.logger.log('columnResults', columnResults)
        if (columnResults?.column) {
          foundColumns.push(columnResults)
        }
      }
    }
    this.logger.log('foundColumns', foundColumns)

    // get the counts for each of the 3 years.
    let turnoutCounts: number[] = []
    for (const column of foundColumns) {
      let historyJson = lodash.cloneDeep(searchJson)
      historyJson.filters[column.column] = 1
      this.logger.log('historyJson', historyJson)
      // sleep for 5 seconds to avoid rate limiting.
      await new Promise((resolve) => setTimeout(resolve, 5000))
      let estimatedCount: number = await this.getEstimatedCounts(
        electionState,
        historyJson,
      )
      this.logger.log(`estimatedCount ${column.column} `, estimatedCount)
      if (estimatedCount > 0) {
        turnoutCounts.push(estimatedCount)
      }
    }

    // update counts with the average and projected turnouts.
    counts = this.getProjectedTurnout(counts, turnoutCounts)
    // this.logger.log('counts', counts);

    return counts
  }

  private getFirstTuesdayOfNovember(year: string) {
    // Month in JavaScript is 0-indexed, so November is represented by 10
    const november = new Date(parseInt(year), 10, 1)

    // Get the day of the week (0 for Sunday, 1 for Monday, ..., 6 for Saturday)
    const dayOfWeek = november.getDay()

    // Calculate the number of days to add to reach the first Tuesday
    const daysToAdd = (2 + 7 - dayOfWeek) % 7

    // Set the date to the first Tuesday of November
    november.setDate(1 + daysToAdd)

    return november
  }

  private getProjectedTurnout(counts: VoterCounts, turnoutCounts: any) {
    // Note: l2 lacks data for number of registered voters at a point in time.
    // so we calculate turnout for all prior years based on current registered voters.
    // which is flawed but the best we can do with the current data.
    let averageTurnout = this.getAverageTurnout(turnoutCounts)

    let trajectory = 0
    if (turnoutCounts.length > 1) {
      // the trajectory is the difference between the last 2 elections
      trajectory = turnoutCounts[0] - turnoutCounts[1]
    }

    let averageTurnoutPercent: string = '0'
    if (averageTurnout > 0 && counts?.total && counts.total > 0) {
      averageTurnoutPercent = (averageTurnout / counts.total).toFixed(2)
    }
    counts.averageTurnout = averageTurnout
    counts.averageTurnoutPercent =
      (parseFloat(averageTurnoutPercent) * 100).toFixed(2).toString() + '%'

    // Calculate the projected turnout.
    // TODO: Jared will revise the strategy in this section.
    let projectedTurnout = 0
    if (trajectory > 0) {
      // turnout is increasing. so we project turnout will be grow by the trajectory.
      // but we include it as part of the averaging formula so as not to overestimate.
      // this may be too conservative and we might need to weight more recent elections more heavily.
      let nextTurnout = averageTurnout + trajectory
      turnoutCounts.push(nextTurnout)
      projectedTurnout = this.getAverageTurnout(turnoutCounts)
    } else {
      let countsTotal = counts?.total || 0
      projectedTurnout = Math.ceil(
        parseFloat(averageTurnoutPercent) * countsTotal,
      )
    }
    let projectedTurnoutPercent: string = '0'
    if (projectedTurnout > 0 && counts?.total && counts.total > 0) {
      projectedTurnoutPercent = (projectedTurnout / counts.total).toFixed(2)
    }
    counts.projectedTurnout = projectedTurnout
    counts.projectedTurnoutPercent =
      (parseFloat(projectedTurnoutPercent) * 100).toFixed(2).toString() + '%'

    // Currently win number is projected turnout x .51 and voter contact is win number x 5
    if (projectedTurnout && projectedTurnout > 0) {
      const winNumber: string = Math.ceil(projectedTurnout * 0.51).toFixed(2)
      const voterContactGoal: string = Math.ceil(
        parseFloat(winNumber) * 5,
      ).toFixed(2)
      counts.winNumber = winNumber
      counts.voterContactGoal = voterContactGoal
    }
    return counts
  }

  private getAverageTurnout(turnoutCounts: number[]) {
    // We look at the trajectory of the registered voters over the last elections.
    // and if it is increasing or decreasing we use that to calculate the projected turnout.
    let totalTurnout = 0
    for (const count of turnoutCounts) {
      // Note: other approaches we can consider are discarding turnouts from the average
      // that are too high or too low.
      totalTurnout += count
    }
    let averageTurnout = Math.ceil(totalTurnout / turnoutCounts.length)
    this.logger.log('averageTurnout', averageTurnout)
    return averageTurnout
  }

  async getColumns(electionState: string) {
    let columns = []
    let columnsUrl = `${API_BASE}/customer/application/columns/1OSR/VM_${electionState}/?id=1OSR&apikey=${L2_DATA_KEY}`
    let columnsResponse: any
    try {
      columnsResponse = await firstValueFrom(this.httpService.get(columnsUrl))
    } catch (e) {
      this.logger.error('error getting columns', e)
    }
    if (columnsResponse?.data?.columns) {
      columns = columnsResponse.data.columns
    }
    return columns
  }

  async getPartisanCounts(
    electionState: string,
    searchJson: any,
  ): Promise<PartisanCounts> {
    let counts: PartisanCounts = {
      total: 0,
      democrat: 0,
      republican: 0,
      independent: 0,
    }

    let countsJson = lodash.cloneDeep(searchJson)
    countsJson.format = 'counts'
    countsJson.columns = ['Parties_Description']

    const searchUrl = `${API_BASE}/records/search/1OSR/VM_${electionState}?id=1OSR&apikey=${L2_DATA_KEY}`
    let response: any
    try {
      response = await firstValueFrom(
        this.httpService.post(searchUrl, countsJson),
      )
    } catch (e) {
      this.logger.log('error getting counts', e)
      return counts
    }
    if (!response?.data || !response?.data?.length) {
      return counts
    }

    for (const item of response.data) {
      counts.total += item.__COUNT
      if (item.Parties_Description === 'Democratic') {
        counts.democrat += item.__COUNT
      } else if (item.Parties_Description === 'Republican') {
        counts.republican += item.__COUNT
      } else {
        counts.independent += item.__COUNT
      }
    }
    return counts
  }

  async getEstimatedCounts(
    electionState: string,
    searchJson: any,
  ): Promise<number> {
    let count = 0
    // Note: this endpoint also returns # of households which we don't use.
    // This endpoint could use same query as getPartisanCounts but we use a different endpoint
    // but if we need partisan election counts we can use the same endpoint.
    const searchUrl = `${API_BASE}/records/search/estimate/1OSR/VM_${electionState}?id=1OSR&apikey=${L2_DATA_KEY}`
    let response: any
    this.logger.log('searchUrl', searchUrl, searchJson)
    try {
      response = await firstValueFrom(
        this.httpService.post(searchUrl, searchJson),
      )
    } catch (e) {
      this.logger.log('error getting counts', e)
      return count
    }
    if (!response?.data || !response?.data?.results) {
      this.logger.log('no results found', response?.data)
      return count
    }
    this.logger.log('found results')
    return response.data.results?.count || count
  }

  async getGenderCounts(
    electionState: string,
    searchJson: any,
  ): Promise<GenderCounts> {
    let counts: GenderCounts = {
      women: 0,
      men: 0,
    }

    let countsJson = lodash.cloneDeep(searchJson)
    countsJson.format = 'counts'
    countsJson.columns = ['Voters_Gender']

    const searchUrl = `${API_BASE}/records/search/1OSR/VM_${electionState}?id=1OSR&apikey=${L2_DATA_KEY}`
    let response: any
    try {
      response = await firstValueFrom(
        this.httpService.post(searchUrl, countsJson),
      )
    } catch (e) {
      this.logger.log('error getting counts', e)
      return counts
    }
    if (!response?.data || !response?.data?.length) {
      return counts
    }

    for (const item of response.data) {
      if (!item?.Voters_Gender) {
        continue
      }
      if (item.Voters_Gender === 'M') {
        counts.men += item.__COUNT
      } else if (item.Voters_Gender === 'F') {
        counts.women += item.__COUNT
      }
    }
    return counts
  }

  async getEthnicityCounts(
    electionState: string,
    searchJson: any,
  ): Promise<EthnicityCounts> {
    let counts: EthnicityCounts = {
      white: 0,
      asian: 0,
      hispanic: 0,
      africanAmerican: 0,
    }

    let countsJson = lodash.cloneDeep(searchJson)
    countsJson.format = 'counts'
    countsJson.columns = ['EthnicGroups_EthnicGroup1Desc']

    const searchUrl = `${API_BASE}/records/search/1OSR/VM_${electionState}?id=1OSR&apikey=${L2_DATA_KEY}`
    let response: any
    try {
      response = await firstValueFrom(
        this.httpService.post(searchUrl, countsJson),
      )
    } catch (e) {
      this.logger.log('error getting counts', e)
      return counts
    }
    if (!response?.data || !response?.data?.length) {
      return counts
    }

    for (const item of response.data) {
      if (!item?.EthnicGroups_EthnicGroup1Desc) {
        continue
      }
      if (item.EthnicGroups_EthnicGroup1Desc === 'European') {
        counts.white += item.__COUNT
      } else if (item.EthnicGroups_EthnicGroup1Desc.includes('Asian')) {
        counts.asian += item.__COUNT
      } else if (item.EthnicGroups_EthnicGroup1Desc.includes('Hispanic')) {
        counts.hispanic += item.__COUNT
      } else if (item.EthnicGroups_EthnicGroup1Desc.includes('African')) {
        counts.africanAmerican += item.__COUNT
      }
    }
    return counts
  }

  private getElectionClassification(electionKeyType: string) {
    if (electionKeyType === 'EG') {
      return 'General Election'
    } else if (electionKeyType === 'ECG') {
      return 'Consolidated General Election'
    } else if (electionKeyType === 'EPP') {
      return 'Presidential Preference Primary'
    } else if (electionKeyType === 'EP') {
      return 'Primary Election'
    } else if (electionKeyType === 'ES') {
      return 'Special Election'
    } else if (electionKeyType === 'EL') {
      return 'Local Election'
    } else if (electionKeyType === 'ER') {
      return 'Runoff Election'
    } else if (electionKeyType === 'EPD') {
      return 'Democratic Election Primary'
    } else {
      return electionKeyType
    }
  }

  private getTurnoutDates(electionDate: string, yearOffset: number) {
    // otherwise we have to guess on the prior election dates.
    let turnoutDateObj = new Date(electionDate)
    turnoutDateObj.setFullYear(turnoutDateObj.getFullYear() - yearOffset)
    let turnoutDates: string[] = []
    turnoutDates.push(
      turnoutDateObj.toISOString().slice(0, 10).replace(/-/g, ''),
    )

    // get 3 calendar days before and after the turnoutDateObj
    // and add them to turnOutDates array.
    for (let i = 1; i < 4; i++) {
      let turnoutDateObjBefore = new Date(turnoutDateObj)
      let turnoutDateObjAfter = new Date(turnoutDateObj)
      turnoutDateObjBefore.setDate(turnoutDateObjBefore.getDate() - i)
      turnoutDateObjAfter.setDate(turnoutDateObjAfter.getDate() + i)
      turnoutDates.push(
        turnoutDateObjBefore.toISOString().slice(0, 10).replace(/-/g, ''),
      )
      turnoutDates.push(
        turnoutDateObjAfter.toISOString().slice(0, 10).replace(/-/g, ''),
      )
    }
    return turnoutDates
  }

  private determineHistoryColumn(
    electionDate: string,
    electionState: string,
    yearOffset: number,
    columns: any[],
    partisanRace: boolean,
    priorElectionDate?: string,
  ): VoterHistoryColumn | undefined {
    let turnoutDateObj = new Date(electionDate)
    turnoutDateObj.setFullYear(turnoutDateObj.getFullYear() - yearOffset)
    if (partisanRace) {
      // partisan races are easy we use the General Election
      let adjustedYear = turnoutDateObj.getFullYear()
      let electionYear = `EG_${adjustedYear}`
      return {
        column: electionYear,
        type: 'General Election',
      }
    }

    let turnoutDates: string[] = []
    if (priorElectionDate) {
      // we know the exact election date so we do not have to guess.
      let priorElectionDateObj = new Date(priorElectionDate)
      turnoutDates.push(
        priorElectionDateObj.toISOString().slice(0, 10).replace(/-/g, ''),
      )
    } else {
      turnoutDates = this.getTurnoutDates(electionDate, yearOffset)
    }

    let yearColumn: string | undefined
    let yearColumnType: string | undefined
    let yearIndex: number | undefined
    let dateKey: string | undefined

    for (const column of columns) {
      if (column.type === 'ELECTION') {
        // column.id is the column we are after.
        // column.name is an object with the states as keys and the value as the electionKey
        // example electionKey: EG_19961105
        if (column.name[electionState]) {
          const electionKey = column.name[electionState]
          // Note: we may want to ask the User if they are running in a Primary.
          // and only consider Primaries (EP) here if they are.
          if (electionKey.includes('_')) {
            const electionSplit = electionKey.split('_')
            const electionKeyType = electionSplit[0]
            const electionKeyDate = electionSplit[1]
            if (
              electionKeyType !== 'EG' &&
              electionKeyType !== 'ECG' &&
              electionKeyType !== 'EL' &&
              electionKeyType !== 'EP'
            ) {
              continue
            }
            for (let x = 0; x < turnoutDates.length; x++) {
              let turnoutDate = turnoutDates[x]
              // if using turnoutDates (not electionDates)
              // there is no way to know the exact date of the election,
              // we prioritize elections that are closer to the electionDate
              if (turnoutDate === electionKeyDate) {
                if (!yearIndex || x < yearIndex) {
                  yearColumn = column.id
                  yearIndex = x
                  dateKey = electionKeyDate
                  yearColumnType =
                    this.getElectionClassification(electionKeyType)
                  break
                }
              }
            }
          }
        }
      }
    }

    if (yearColumn && dateKey && yearColumnType) {
      return {
        column: yearColumn,
        date: dateKey,
        type: yearColumnType,
      }
    } else {
      return undefined
    }
  }
}
