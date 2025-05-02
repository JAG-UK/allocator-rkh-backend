import { AggregateRoot, ApplicationError, IEventStore, IRepository } from '@filecoin-plus/core'
import { StatusCodes } from 'http-status-codes'

import {
  GovernanceReviewStarted,
  KYCStarted,
  KYCApproved,
  KYCRejected,
  GovernanceReviewApproved,
  GovernanceReviewRejected,
  RKHApprovalStarted,
  DatacapAllocationUpdated,
  RKHApprovalsUpdated,
  RKHApprovalCompleted,
  MetaAllocatorApprovalStarted,
  MetaAllocatorApprovalCompleted,
  ApplicationCreated,
  ApplicationEdited,
  ApplicationPullRequestUpdated,
  AllocatorMultisigUpdated,
  DatacapRefreshRequested,
} from './application.events'
import { KYCApprovedData, KYCRejectedData } from '@src/domain/types'
import { ApplicationPullRequestFile } from '@src/application/services/pull-request.types'

export interface IDatacapAllocatorRepository extends IRepository<DatacapAllocator> { }

export interface IDatacapAllocatorEventStore extends IEventStore<DatacapAllocator> { }

export enum ApplicationStatus {
  SUBMISSION_PHASE = 'SUBMISSION_PHASE',
  KYC_PHASE = 'KYC_PHASE',
  GOVERNANCE_REVIEW_PHASE = 'GOVERNANCE_REVIEW_PHASE',
  RKH_APPROVAL_PHASE = 'RKH_APPROVAL_PHASE',
  META_APPROVAL_PHASE = 'META_APPROVAL_PHASE',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum ApplicationAllocator {
  META_ALLOCATOR = 'META_ALLOCATOR',
  RKH_ALLOCATOR = 'RKH_ALLOCATOR',
}

export type ApplicationPullRequest = {
  prNumber: number
  prUrl: string
  commentId: number
  timestamp: Date
}

export type ApplicationApplicantData = {
  name: string
  location: string
  githubHandle: string
  slackHandle: string
  address: string
  orgName: string
  orgAddress: string
}

export type ApplicationInstruction = {
  method: string
  datacap_amount: number
  timestamp?: number
  status?: string
}

export enum ApplicationInstructionStatus {
  GRANTED = 'GRANTED',
  DENIED = 'DENIED',
  PENDING = 'PENDING',
}

export type ApplicationGrantCycle = {
  id: number
  status: ApplicationInstructionStatus
  pullRequest: ApplicationPullRequest
  instruction: ApplicationInstruction
}

export class DatacapAllocator extends AggregateRoot {
  public applicationNumber: number
  public applicationPullRequest: ApplicationPullRequest

  public applicantName: string
  public applicantLocation: string
  public applicantGithubHandle: string
  public applicantSlackHandle: string
  public applicantAddress: string
  public applicantOrgName: string
  public applicantOrgAddresses: string
  public applicantOtherGithubHandles: string[]

  public allocationStandardizedAllocations: string[]
  public allocationAudit: string
  public allocationDistributionRequired: string
  public allocationTargetClients: string[]
  public allocationRequiredReplicas: string
  public allocationRequiredStorageProviders: string
  public allocationTooling: string[]
  public allocationDataTypes: string[]
  public allocationProjected12MonthsUsage: string
  public allocationBookkeepingRepo: string
  public allocationMaxDcClient: string
  public applicationInstructions: ApplicationInstruction[] = []

  public applicationStatus: ApplicationStatus

  public type: string
  public datacap: number
  public datacapAmount: number
  public refresh?: boolean

  public rkhApprovalThreshold: number = 2
  public rkhApprovals: string[] = []

  public allocatorActorId?: string
  public allocatorMultisigAddress?: string
  public allocatorMultisigThreshold?: number
  public allocatorMultisigSigners?: string[]

  public grantCycles: ApplicationGrantCycle[] = []

  public allocationDatacapAllocationLimits: string
  public onChainAddressForDataCapAllocation: string

  public status: { [key: string]: number | null } = {
    "Submitted": null,
    "In Review": null,
    "In Refresh": null,
    "Approved": null,
    "Declined": null,
  }

  constructor(guid?: string) {
    super(guid)
  }

  get grantCycle(): number {
    return this.grantCycles.length
  }

  static create(params: {
    applicationId: string
    applicationNumber: number
    applicantName: string
    applicantAddress: string
    applicantOrgName: string
    applicantOrgAddresses: string
    allocationTrancheScheduleType: string
    allocationAudit: string
    allocationDistributionRequired: string
    allocationRequiredStorageProviders: string
    allocationRequiredReplicas: string
    datacapAllocationLimits: string
    applicantGithubHandle: string
    otherGithubHandles: string[]
    onChainAddressForDataCapAllocation: string
  }): DatacapAllocator {
    const allocator = new DatacapAllocator(params.applicationId)
    allocator.applyChange(
      new ApplicationCreated(
        allocator.guid,
        params.applicationNumber,
        params.applicantName,
        params.applicantAddress,
        params.applicantOrgName,
        params.applicantOrgAddresses,
        params.allocationTrancheScheduleType,
        params.allocationAudit,
        params.allocationDistributionRequired,
        params.allocationRequiredStorageProviders,
        params.allocationRequiredReplicas,
        params.datacapAllocationLimits,
        params.applicantGithubHandle,
        params.otherGithubHandles ?? [],
        params.onChainAddressForDataCapAllocation
      ),
    )
    return allocator
  }

  edit(file: ApplicationPullRequestFile) {
    this.ensureValidApplicationStatus([
      ApplicationStatus.SUBMISSION_PHASE,
      ApplicationStatus.KYC_PHASE,
      ApplicationStatus.GOVERNANCE_REVIEW_PHASE,
    ])

    this.applyChange(
      new ApplicationEdited(this.guid, file),
    )
  }

  setAllocatorMultisig(
    allocatorActorId: string,
    multisigAddress: string,
    multisigThreshold: number,
    multisigSigners: string[],
  ) {
    this.ensureValidApplicationStatus([ApplicationStatus.SUBMISSION_PHASE])

    this.applyChange(
      new AllocatorMultisigUpdated(this.guid, allocatorActorId, multisigAddress, multisigThreshold, multisigSigners),
    )
  }

  setApplicationPullRequest(
    pullRequestNumber: number,
    pullRequestUrl: string,
    commentId: number,
    refresh: boolean = false,
  ) {
    console.log('setApplicationPullRequest', this.applicationStatus)
    if (!refresh) {
      this.ensureValidApplicationStatus([ApplicationStatus.SUBMISSION_PHASE])
      this.applyChange(new ApplicationPullRequestUpdated(
        this.guid,
        pullRequestNumber,
        pullRequestUrl,
        commentId,
        ApplicationStatus.KYC_PHASE,
      ))
    } else {
      this.ensureValidApplicationStatus([ApplicationStatus.APPROVED])
      this.applyChange(new ApplicationPullRequestUpdated(
        this.guid,
        pullRequestNumber,
        pullRequestUrl,
        commentId,
        ApplicationStatus.GOVERNANCE_REVIEW_PHASE,
      ))
    }
  }

  approveKYC(data: KYCApprovedData) {
    this.ensureValidApplicationStatus([ApplicationStatus.KYC_PHASE])

    this.applyChange(new KYCApproved(this.guid, data))
    this.applyChange(new GovernanceReviewStarted(this.guid))
  }

  rejectKYC(data: KYCRejectedData) {
    this.ensureValidApplicationStatus([ApplicationStatus.KYC_PHASE])

    this.applyChange(new KYCRejected(this.guid, data))
  }

  approveGovernanceReview() {
    this.ensureValidApplicationStatus([ApplicationStatus.GOVERNANCE_REVIEW_PHASE])    
    this.ensureValidApplicationInstructions([
      ApplicationAllocator.META_ALLOCATOR,
      ApplicationAllocator.RKH_ALLOCATOR,
    ])
    // NOTE: 'GRANTED' happens at MetaAllocatorApprovalCompleted or RKHApprovalCompleted
    const lastInstructionIndex = this.applicationInstructions.length - 1
    this.applicationInstructions[lastInstructionIndex].status = ApplicationInstructionStatus.PENDING
    this.applicationInstructions[lastInstructionIndex].timestamp = Math.floor(Date.now() / 1000)
    this.applyChange(new GovernanceReviewApproved(this.guid, this.applicationInstructions))
    if (this.applicationInstructions[lastInstructionIndex].method === ApplicationAllocator.META_ALLOCATOR) {
      this.applyChange(new MetaAllocatorApprovalStarted(this.guid))
    } else {
      this.applyChange(new RKHApprovalStarted(this.guid, 2)) // TODO: Hardcoded 2 for multisig threshold
    }
  }

  rejectGovernanceReview() {
    this.ensureValidApplicationStatus([ApplicationStatus.GOVERNANCE_REVIEW_PHASE])
    this.ensureValidApplicationInstructions([
      ApplicationAllocator.META_ALLOCATOR,
      ApplicationAllocator.RKH_ALLOCATOR,
    ])
    const lastInstructionIndex = this.applicationInstructions.length - 1
    this.applicationInstructions[lastInstructionIndex].status = ApplicationInstructionStatus.DENIED
    this.applicationInstructions[lastInstructionIndex].timestamp = Math.floor(Date.now() / 1000)
    this.applyChange(new GovernanceReviewRejected(this.guid, this.applicationInstructions))
  }

  updateRKHApprovals(messageId: number, approvals: string[]) {
    this.ensureValidApplicationStatus([ApplicationStatus.RKH_APPROVAL_PHASE])

    if (approvals.length !== this.rkhApprovals.length) {
      this.applyChange(new RKHApprovalsUpdated(this.guid, messageId, approvals, this.rkhApprovalThreshold))
    }
  }

  completeMetaAllocatorApproval(blockNumber: number, txHash: string) {
    this.ensureValidApplicationInstructions([
      ApplicationAllocator.META_ALLOCATOR,
      ApplicationAllocator.RKH_ALLOCATOR,
    ])
    const lastInstructionIndex = this.applicationInstructions.length - 1
    this.applicationInstructions[lastInstructionIndex].status = ApplicationInstructionStatus.GRANTED
    this.applicationInstructions[lastInstructionIndex].timestamp = Math.floor(Date.now() / 1000)
    this.applyChange(new MetaAllocatorApprovalCompleted(this.guid, blockNumber, txHash, this.applicationInstructions))
  }

  completeRKHApproval() {
    this.ensureValidApplicationStatus([ApplicationStatus.RKH_APPROVAL_PHASE])
    this.ensureValidApplicationInstructions([
      ApplicationAllocator.META_ALLOCATOR,
      ApplicationAllocator.RKH_ALLOCATOR,
    ])
    const lastInstructionIndex = this.applicationInstructions.length - 1
    this.applicationInstructions[lastInstructionIndex].status = ApplicationInstructionStatus.GRANTED
    this.applicationInstructions[lastInstructionIndex].timestamp = Math.floor(Date.now() / 1000)    
    this.applyChange(new RKHApprovalCompleted(this.guid, this.applicationInstructions))
  }

  updateDatacapAllocation(datacap: number) {
    try {
      this.completeRKHApproval()
    } catch (error) { }
    // TODO: this.applyChange(new DatacapAllocationUpdated(this.guid, datacap));
  }

  requestDatacapRefresh() {
    this.ensureValidApplicationStatus([ApplicationStatus.APPROVED])

    const prevInstruction = this.applicationInstructions[this.applicationInstructions.length - 1]
    const refreshAmount = prevInstruction.datacap_amount * 2
    const refreshMethod = prevInstruction.method

    this.applyChange(new DatacapRefreshRequested(this.guid, refreshAmount, refreshMethod))
  }

  applyApplicationCreated(event: ApplicationCreated) {
    console.log('applyApplicationCreated', event)
    this.guid = event.guid

    this.applicationNumber = event.applicationNumber
    this.applicantName = event.applicantName
    this.applicantAddress = event.applicantAddress
    this.applicantOrgName = event.applicantOrgName
    this.applicantOrgAddresses = event.applicantOrgAddresses
    this.applicantGithubHandle = event.applicantGithubHandle
    this.otherGithubHandles = event.otherGithubHandles

    this.allocationTrancheScheduleType = event.allocationTrancheScheduleType
    this.allocationAudit = event.audit
    this.allocationDistributionRequired = event.distributionRequired
    this.allocationRequiredStorageProviders = event.allocationRequiredStorageProviders
    this.allocationRequiredReplicas = event.allocationRequiredReplicas
    this.allocationTooling = []
    this.datacapAllocationLimits = event.datacapAllocationLimits
    this.onChainAddressForDataCapAllocation = event.onChainAddressForDataCapAllocation

    this.applicationStatus = ApplicationStatus.SUBMISSION_PHASE

    this.applicationInstructions = [
      {
        method: ApplicationAllocator.META_ALLOCATOR,
        datacap_amount: 5,
        timestamp: event.timestamp.getTime(),
        status: ApplicationInstructionStatus.PENDING,
      },
    ]

    this.status = {
      "Submitted": null,
      "In Review": null,
      "In Refresh": null,
      "Approved": null,
      "Declined": null,
    }
  }

  applyApplicationEdited(event: ApplicationEdited) {
    console.log('applyApplicationEdited', event)

    this.applicantAddress = event.file.address || this.applicantAddress
    this.applicantName = event.file.name || this.name
    this.applicantOrgName = event.file.organization || this.organization
    // TODO: metapathway_type: 'MA',
    // TODO: ma_address: "0x15a9d9b81e3c67b95ffedfb4416d25a113c8c6df",
    this.associatedOrgAddresses = event.file.associated_org_addresses || this.associatedOrgAddresses

    this.allocationStandardizedAllocations = event.file.application.allocations || this.allocationStandardizedAllocations
    this.allocationAudit = event.file.application.audit && event.file.application.audit.length > 0
      ? event.file.application.audit[0]
      : this.allocationAudit
    this.allocationDistributionRequired = event.file.application.distribution && event.file.application.distribution.length > 0
      ? event.file.application.distribution[0]
      : this.allocationDistributionRequired
    this.allocationRequiredReplicas = event.file.application.required_replicas || this.allocationRequiredReplicas
    this.allocationRequiredStorageProviders = event.file.application.required_sps || this.allocationRequiredStorageProviders
    this.allocationTooling = event.file.application.tooling || this.allocationTooling
    this.allocationMaxDcClient = event.file.application.max_DC_client || this.allocationMaxDcClient
    this.applicantGithubHandle = event.file.application.github_handles && event.file.application.github_handles.length > 0
      ? event.file.application.github_handles[0]
      : this.applicantGithubHandle
    this.allocationBookkeepingRepo = event.file.application.allocation_bookkeeping || this.allocationBookkeepingRepo
    // TODO: client_contract_address
    this.onChainAddressForDataCapAllocation = event.file.application.client_contract_address || this.onChainAddressForDataCapAllocation
    
    this.allocatorMultisigAddress = event.file.pathway_addresses?.msig || this.allocatorMultisigAddress
    this.allocatorMultisigSigners = event.file.pathway_addresses?.signer || this.allocatorMultisigSigners

    this.applicationInstructions = Object.entries(event.file.LifeCycle).map(([_, value]) => ({
      method: event.file.metapathway_type === "MA" ? ApplicationAllocator.META_ALLOCATOR : ApplicationAllocator.RKH_ALLOCATOR,
      datacap_amount: parseInt(value[1]),
      timestamp: parseInt(value[0]),
    }))
  }

  applyAllocatorMultisigUpdated(event: AllocatorMultisigUpdated) {
    this.allocatorActorId = event.allocatorActorId
    this.allocatorMultisigAddress = event.multisigAddress
    this.allocatorMultisigThreshold = event.multisigThreshold
    this.allocatorMultisigSigners = event.multisigSigners

    if (this.applicationStatus === ApplicationStatus.SUBMISSION_PHASE && this.applicationPullRequest) {
      this.applicationStatus = ApplicationStatus.KYC_PHASE
    }
  }

  applyApplicationPullRequestUpdated(event: ApplicationPullRequestUpdated) {
    this.applicationPullRequest = {
      prNumber: event.prNumber,
      prUrl: event.prUrl,
      commentId: event.commentId,
      timestamp: event.timestamp,
    }

    if (this.applicationStatus === ApplicationStatus.SUBMISSION_PHASE && this.allocatorActorId) {
      this.applicationStatus = ApplicationStatus.KYC_PHASE
    }
  }

  applyKYCStarted(_: KYCStarted) {
    this.applicationStatus = ApplicationStatus.KYC_PHASE
  }

  applyKYCApproved(_: KYCApproved) {
    this.status["Submitted"] = Math.floor(Date.now() / 1000)
  }

  applyKYCRejected(_: KYCRejected) {
    this.applicationStatus = ApplicationStatus.REJECTED
  }

  applyGovernanceReviewStarted(_: GovernanceReviewStarted) {
    this.applicationStatus = ApplicationStatus.GOVERNANCE_REVIEW_PHASE
  }

  applyGovernanceReviewApproved(_: GovernanceReviewApproved) {
    // TODO: ?
  }

  applyGovernanceReviewRejected(_: GovernanceReviewRejected) {
    this.applicationStatus = ApplicationStatus.REJECTED
  }

  applyRKHApprovalStarted(event: RKHApprovalStarted) {
    this.applicationStatus = ApplicationStatus.RKH_APPROVAL_PHASE
    this.rkhApprovalThreshold = event.approvalThreshold
  }

  applyRKHApprovalsUpdated(event: RKHApprovalsUpdated) {
    this.applicationStatus =
      event.approvals.length < event.approvalThreshold
        ? ApplicationStatus.RKH_APPROVAL_PHASE
        : ApplicationStatus.APPROVED

    this.rkhApprovals = event.approvals
    this.rkhApprovalThreshold = event.approvalThreshold
  }

  applyRKHApprovalCompleted(event: RKHApprovalCompleted) {
    this.applicationStatus = ApplicationStatus.APPROVED
  }

  applyMetaAllocatorApprovalStarted(event: MetaAllocatorApprovalStarted) {
    this.applicationStatus = ApplicationStatus.META_APPROVAL_PHASE
  }

  applyMetaAllocatorApprovalCompleted(event: MetaAllocatorApprovalCompleted) {
    this.applicationStatus = ApplicationStatus.APPROVED

    const index = this.applicationInstructions.length - 1
    this.applicationInstructions[index].timestamp = event.timestamp.getTime()
    this.applicationInstructions[index].status = ApplicationInstructionStatus.GRANTED
  }

  applyDatacapAllocationUpdated(event: DatacapAllocationUpdated) {
    this.applicationStatus = ApplicationStatus.APPROVED
    this.datacapAmount = event.datacap
  }

  applyDatacapRefreshRequested(event: DatacapRefreshRequested) {
    console.log('applyDatacapRefreshRequested', this.applicationStatus)
    this.applicationStatus = ApplicationStatus.GOVERNANCE_REVIEW_PHASE
    this.applicationInstructions.push({
      method: event.method,
      datacap_amount: event.amount,
      timestamp: event.timestamp.getTime(),
      status: ApplicationInstructionStatus.PENDING,
    })
    console.log('applyDatacapRefreshRequested', this.applicationInstructions)
  }

  private ensureValidApplicationStatus(
    expectedStatuses: ApplicationStatus[],
    errorCode: string = '5308',
    errorMessage: string = 'Invalid operation for the current phase',
  ): void {
    if (!expectedStatuses.includes(this.applicationStatus)) {
      throw new ApplicationError(StatusCodes.BAD_REQUEST, errorCode, errorMessage)
    }
  }

  private ensureValidApplicationInstructions(
    expectedInstructionMethods: ApplicationAllocator[],
    errorCode: string = '5308',
    errorMessage: string = 'Invalid operation for the current phase',
  ): void {

    if (this.applicationInstructions.length === 0) {
      throw new ApplicationError(StatusCodes.BAD_REQUEST, errorCode, 'Empty instruction data')
    }

    const lastInstruction = this.applicationInstructions[this.applicationInstructions.length - 1];
    let instructionMethod: string
    let instructionAmount: number
    try {
      instructionMethod = lastInstruction.method
      instructionAmount = lastInstruction.datacap_amount
    } catch (error) {
      throw new ApplicationError(StatusCodes.BAD_REQUEST, errorCode, 'Latest instruction data is invalid')
    }

    if (!expectedInstructionMethods.includes(instructionMethod as ApplicationAllocator)) {
      throw new ApplicationError(StatusCodes.BAD_REQUEST, errorCode, errorMessage)
    }
  }
}
