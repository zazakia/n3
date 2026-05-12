import { Model } from '@nozbe/watermelondb'
import { field, date, readonly } from '@nozbe/watermelondb/decorators'

export default class CollectionGroup extends Model {
    static table = 'collection_groups'

    @field('name') name: string;
    @field('collector_id') collectorId: string;
    @field('collection_day') collectionDay: number; // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
    @field('is_active') isActive: boolean;
    @readonly @date('created_at') createdAt: number;
    @readonly @date('updated_at') updatedAt: number;
    @date('deleted_at') deletedAt: number;
}
