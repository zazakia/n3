import { Model } from '@nozbe/watermelondb'
import { field, date, children, readonly, relation } from '@nozbe/watermelondb/decorators'
import { EncryptionService } from '../../services/EncryptionService'

export default class Borrower extends Model {
    static table = 'borrowers'

    @field('full_name') fullName: string;
    @field('address') address: string;
    @field('phone') phone: string;
    @field('area') area: string;
    @field('route_index') routeIndex: number;
    @relation('collectors', 'collector_id') collector: any;
    @field('collector_id') collectorId: string;
    @field('auth_id') authId: string;
    @field('gender') gender: string;
    @field('notes') notes: string;
    @field('created_by') createdBy: string;
    @field('latitude') latitude: number;
    @field('longitude') longitude: number;
    @field('group') group: string;
    @field('first_name') firstName: string;
    @field('last_name') lastName: string;
    @field('co_maker_name') coMakerName: string;
    @field('business') business: string;
    @date('date_of_birth') dateOfBirth: number;
    @readonly @date('created_at') createdAt: number;
    @readonly @date('updated_at') updatedAt: number;
    @date('deleted_at') deletedAt: number | null;

    @children('loans') loans: any;
    @children('savings_transactions') savings_transactions: any;

    get decryptedPhone(): string | null {
        return EncryptionService.decrypt(this.phone);
    }

    get decryptedAddress(): string | null {
        return EncryptionService.decrypt(this.address);
    }
}
