import { injectable } from 'inversify'
import config from '@src/config'

const GOVERNANCE_REVIEW_ADDRESSES = config.GOVERNANCE_REVIEW_ADDRESSES
const RKH_ADDRESSES = config.RKH_ADDRESSES

@injectable()
export class RoleService {
  getRole(address: string): string {
    let role = 'USER'
    if (GOVERNANCE_REVIEW_ADDRESSES.includes(address.toLowerCase())) {
      role = 'GOVERNANCE_TEAM'
    } else if (RKH_ADDRESSES.includes(address.toLowerCase())) {
      role = 'ROOT_KEY_HOLDER'
    }

    return role;
  }
}
