/* eslint-disable @typescript-eslint/no-dynamic-delete */
import { Query } from 'mongoose';
import { excludeField } from '../modules/deal/deal.constant';


export class QueryBuilder<T> {
  public queryModel: Query<T[], T>;
  public query: Record<string, string>;

  constructor(queryModel: Query<T[], T>, query: Record<string, string>) {
    this.queryModel = queryModel;
    this.query = query;
  }

  // Case Sensitive filtering
  filter(): this {
    const filter = { ...this.query };
    for (const value of excludeField) {
      delete filter[value];
    }

    this.queryModel = this.queryModel.find(filter);
    return this;
  }

  // Searching
  search(searchableField: string[]): this {
    const searchTerm = this.query.searchTerm || '';
    const searchQuery = {
      $or: searchableField.map((field) => ({
        [field]: { $regex: searchTerm, $options: 'i' },
      })),
    };

    this.queryModel = this.queryModel.find(searchQuery);
    return this;
  }

  // Sorting
  sort(): this {
    const sort = this.query.sort || '-createdAt'; // ex: title, or -title
    this.queryModel = this.queryModel.sort(sort);
    return this;
  }

  // Field filtering
  select(): this {
    const fields = this.query.fields?.split(',').join(' ') || ''; // ex: "title description price"
    this.queryModel = this.queryModel.select(fields);
    return this;
  }

  // Pagination
  paginate(): this {
    const page = Number(this.query.page) || 1;
    const limit = Number(this.query.limit) || 10;
    const skip = (page - 1) * limit;

    this.queryModel = this.queryModel.skip(skip).limit(limit);
    return this;
  }

  join(): this {
    const joinQuery = this.query?.join;
    
    if (!joinQuery) {
        return this;
    }

    const refs = joinQuery.split(",");
    refs.forEach((ref) => {
      return (this.queryModel = this.queryModel.populate({ path: ref }));
    });
 
    return this;
  }

  // Final build instance
  build() {
    return this.queryModel;
  }

  // Generate meta data
  async getMeta() {
    const page = Number(this.query.page) || 1;
    const limit = Number(this.query.limit) || 10;
    const totalDocuments = await this.queryModel.model.countDocuments();
    const totalPage = Math.ceil(totalDocuments / limit);

    return {
      page,
      limit,
      total: totalDocuments,
      totalPage,
    };
  }
}
