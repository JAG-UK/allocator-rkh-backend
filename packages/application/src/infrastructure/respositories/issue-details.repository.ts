import { IRepository } from '@filecoin-plus/core'
import { inject, injectable } from 'inversify'
import { BulkWriteResult, Db } from 'mongodb'
import { TYPES } from '@src/types'
import { IssueDetails } from '@src/infrastructure/respositories/issue-details'

type PaginatedResults<T> = {
  results: T[]
  pagination: {
    currentPage: number
    totalPages: number
    totalItems: number
    itemsPerPage: number
  }
}

export interface IIssueDetailsRepository extends IRepository<IssueDetails> {
  update(issueDetails: Partial<IssueDetails>): Promise<void>

  getPaginated(page: number, limit: number, search?: string): Promise<PaginatedResults<IssueDetails>>

  getAll(): Promise<IssueDetails[]>

  getById(guid: string): Promise<IssueDetails>

  save(issueDetails: IssueDetails): Promise<void>

  bulkUpsertByField(issues: IssueDetails[], identifyingField: keyof IssueDetails): Promise<BulkWriteResult>
}

@injectable()
class IssueDetailsRepository implements IRepository<IssueDetails> {
  constructor(@inject(TYPES.Db) private readonly _db: Db) {}

  async getById(guid: string): Promise<IssueDetails> {
    return this._db.collection<IssueDetails>('issueDetails').findOne({ applicationId: guid }) as Promise<IssueDetails>
  }

  async save(issueDetails: IssueDetails): Promise<void> {
    await this._db
      .collection<IssueDetails>('issueDetails')
      .updateOne({ githubIssueId: issueDetails.githubIssueId }, { $set: issueDetails }, { upsert: true })
  }

  async bulkUpsertByField(issues: IssueDetails[], identifyingField: keyof IssueDetails): Promise<BulkWriteResult> {
    const bulkOps = issues.map((issue) => ({
      replaceOne: {
        filter: { [identifyingField]: issue[identifyingField] },
        replacement: issue,
        upsert: true,
      },
    }))

    return this._db.collection<IssueDetails>('issueDetails').bulkWrite(bulkOps)
  }

  async update(issueDetails: Partial<IssueDetails>): Promise<void> {
    await this._db
      .collection<IssueDetails>('issueDetails')
      .updateOne({ id: issueDetails.githubIssueId }, { $set: issueDetails }, { upsert: true })
  }

  async getPaginated(page: number, limit: number, search?: string): Promise<PaginatedResults<IssueDetails>> {
    const skip = (page - 1) * limit
    const filter: any = {}
    const orConditions: any[] = []

    if (orConditions.length > 0) {
      filter.$or = orConditions
    }

    if (search) {
      filter.$and = [
        {
          $or: [{ name: { $regex: search, $options: 'i' } }, { address: { $regex: search, $options: 'i' } }],
        },
      ]
    }

    const totalCount = await this._db.collection<IssueDetails>('issueDetails').countDocuments(filter)
    const issues = await this._db
      .collection<IssueDetails>('issueDetails')
      .find(filter)
      .skip(skip)
      .limit(limit)
      .toArray()

    return {
      results: issues,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalItems: totalCount,
        itemsPerPage: limit,
      },
    }
  }

  async getAll(): Promise<IssueDetails[]> {
    return this._db.collection<IssueDetails>('issueDetails').find({}).toArray()
  }
}

export { IssueDetailsRepository }
