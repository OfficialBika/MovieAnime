import type { Db, Filter, WithId } from "mongodb";
import type { AnimeChannelDocument, EpisodeDocument, MediaVersionDocument } from "../../shared/types.js";

interface StringMediaDocument extends MediaVersionDocument { _id:string; }
const resolutionOrder:Record<string,number>={"240P":1,"480P":2,"720P":3,"1080P":4,"2K":5,"4K":6,"UNKNOWN":99};

export class CatalogRepository {
  constructor(private readonly db:Db) {}
  listEnabledChannels():Promise<WithId<AnimeChannelDocument>[]> {
    return this.db.collection<AnimeChannelDocument>("anime_channels").find({enabled:true}).sort({title:1}).toArray();
  }
  getChannel(animeId:string):Promise<WithId<AnimeChannelDocument>|null> {
    return this.db.collection<AnimeChannelDocument>("anime_channels").findOne({_id:animeId,enabled:true} as Filter<AnimeChannelDocument>);
  }
  async listEpisodes(animeId:string,skip:number,limit:number):Promise<number[]> {
    const rows=await this.db.collection<EpisodeDocument>("episodes").find({animeId}).sort({episodeNumber:1}).skip(skip).limit(limit).project({episodeNumber:1}).toArray();
    return rows.map(row=>row.episodeNumber);
  }
  async latestEpisode(animeId:string):Promise<number|undefined> {
    const row=await this.db.collection<EpisodeDocument>("episodes").find({animeId}).sort({episodeNumber:-1}).project({episodeNumber:1}).limit(1).next();
    return row?.episodeNumber;
  }
  async listResolutions(animeId:string,episodeNumber:number):Promise<MediaVersionDocument[]> {
    const episode=await this.db.collection<EpisodeDocument>("episodes").findOne({animeId,episodeNumber});
    if(!episode)return [];
    const versions=await this.db.collection<MediaVersionDocument>("media_versions").find({episodeId:episode._id,available:true}).toArray();
    return versions.sort((a,b)=>(resolutionOrder[a.resolution]??99)-(resolutionOrder[b.resolution]??99));
  }
  getMediaById(mediaId:string):Promise<WithId<StringMediaDocument>|null> {
    return this.db.collection<StringMediaDocument>("media_versions").findOne({_id:mediaId});
  }
}