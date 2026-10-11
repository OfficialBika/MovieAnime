import type { Db, Filter, WithId } from "mongodb";
import type { AnimeChannelDocument, EpisodeDocument, MediaVersionDocument } from "../../shared/types.js";

export class CatalogRepository {
  constructor(private readonly db: Db) {}

  listEnabledChannels(): Promise<WithId<AnimeChannelDocument>[]> {
    return this.db.collection<AnimeChannelDocument>("anime_channels")
      .find({ enabled: true }).sort({ title: 1 }).toArray();
  }

  getChannel(channelId: string): Promise<WithId<AnimeChannelDocument> | null> {
    return this.db.collection<AnimeChannelDocument>("anime_channels")
      .findOne({ telegramChannelId: channelId, enabled: true });
  }

  async listEpisodes(animeId: string, skip: number, limit: number): Promise<number[]> {
    const rows = await this.db.collection<EpisodeDocument>("episodes")
      .find({ animeId }).sort({ episodeNumber: 1 }).skip(skip).limit(limit).project({ episodeNumber: 1 }).toArray();
    return rows.map((row) => row.episodeNumber);
  }

  async latestEpisode(animeId: string): Promise<number | undefined> {
    const row = await this.db.collection<EpisodeDocument>("episodes")
      .find({ animeId }).sort({ episodeNumber: -1 }).project({ episodeNumber: 1 }).limit(1).next();
    return row?.episodeNumber;
  }

  async listResolutions(animeId: string, episodeNumber: number): Promise<MediaVersionDocument[]> {
    const episode = await this.db.collection<EpisodeDocument>("episodes")
      .findOne({ animeId, episodeNumber });
    if (!episode) return [];
    return this.db.collection<MediaVersionDocument>("media_versions")
      .find({ episodeId: episode._id, available: true })
      .sort({ resolution: 1 }).toArray();
  }

  async getMediaById(mediaId: string): Promise<WithId<MediaVersionDocument> | null> {
    return this.db.collection<MediaVersionDocument>("media_versions").findOne({ _id: mediaId } as Filter<MediaVersionDocument>);
  }
}