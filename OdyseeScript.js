const URL_CLAIM_SEARCH = "https://api.na-backend.odysee.com/api/v1/proxy?m=claim_search"
const URL_RESOLVE = "https://api.na-backend.odysee.com/api/v1/proxy?m=resolve";
const URL_PREFERENCES = "https://api.na-backend.odysee.com/api/v1/proxy?m=preference_get"
const URL_CONTENT = "https://odysee.com/\$/api/content/v2/get";
const URL_REACTIONS = "https://api.odysee.com/reaction/list";
const URL_VIEW_COUNT = "https://api.odysee.com/file/view_count";
const URL_USER_NEW = "https://api.odysee.com/user/new";
const URL_COMMENTS_LIST = "https://comments.odysee.tv/api/v2?m=comment.List";
const URL_CHANNEL_LIST = "https://api.na-backend.odysee.com/api/v1/proxy?m=channel_list"
const URL_COLLECTION_LIST = "https://api.na-backend.odysee.com/api/v1/proxy?m=collection_list"
const URL_STATUS = "https://api.na-backend.odysee.com/api/v2/status"
const URL_REPORT_PLAYBACK = "https://watchman.na-backend.odysee.com/reports/playback"
const URL_BASE = "https://odysee.com";
const URL_API_SUB_COUNT = 'https://api.odysee.com/subscription/sub_count';
const PLAYLIST_URL_BASE = "https://odysee.com/$/playlist/"

const CLAIM_TYPE_STREAM = "stream";
const ORDER_BY_RELEASETIME = "release_time";

const REGEX_DETAILS_URL = /^(https:\/\/odysee\.com\/|lbry:\/\/)((@[^\/@]+)(:|#)([a-fA-F0-9]+)\/)?([^\/@]+)(:|#)([a-fA-F0-9]+)(\?|$)/
const REGEX_CHANNEL_URL = /^(https:\/\/odysee\.com\/|lbry:\/\/)(@[^\/@]+)(:|#)([a-fA-F0-9]+)(\?|$)/
const REGEX_PLAYLIST = /^https:\/\/odysee\.com\/\$\/playlist\/([0-9a-fA-F]+?)$/
const REGEX_COLLECTION = /^https:\/\/odysee\.com\/\$\/playlist\/([0-9a-fA-F-]+?)$/
const REGEX_FAVORITES = /^https:\/\/odysee\.com\/\$\/playlist\/favorites$/
const REGEX_WATCH_LATER = /^https:\/\/odysee\.com\/\$\/playlist\/watchlater$/

const CLAIM_ID_LENGTH = 40

const PLATFORM = "Odysee";
const PLATFORM_CLAIMTYPE = 3;

const EMPTY_AUTHOR = new PlatformAuthorLink(new PlatformID(PLATFORM, "", plugin.config.id), "Anonymous", "")

let localState = {};
let localSettings

//Source Method
source.enable = function (config, settings, savedState) {
	if (IS_TESTING) {
		log("IS_TESTING true")
		log("logging configuration")
		log(config)
		log("logging settings")
		log(settings)
		log("logging savedState")
		log(savedState)
	}
	localSettings = settings
	if (!savedState) {
		if (bridge.isLoggedIn()) {
			const response = http
				.batch()
				.POST(
					URL_CHANNEL_LIST,
					JSON.stringify(
						{ jsonrpc: "2.0", method: "channel_list", params: { page: 1, page_size: 99999, resolve: true }, id: 1719338082805 }
					),
					{},
					true
				)
				.GET(
					URL_STATUS,
					{},
					true
				)
				.execute()
			const channelList = JSON.parse(response[0].body)
			const userId = JSON.parse(response[1].body).user.id.toString()
			const channel = channelList.result.items.length === 0 ? undefined : {
				channelId: channelList.result.items[0].claim_id,
				name: channelList.result.items[0].value.title,
				thumbnail: channelList.result.items[0].value?.thumbnail?.url,
				url: channelList.result.items[0].permanent_url,
			}

			const { auth_token } = getAuthInfo();

			localState = {
				channel,
				userId,
				auth_token
			}

		} else {

			const { userId, auth_token } = getAuthInfo();
			localState.auth_token = auth_token;
			localState.userId = userId;

		}
	} else {
		localState = JSON.parse(savedState)
	}
}
source.saveState = function saveState() {
	return JSON.stringify(localState)
}
source.getHome = function () {
	const contentData = getOdyseeContentData();
	const featured = contentData.categories["PRIMARY_CONTENT"];
	const query = {
		channel_ids: featured.channelIds,
		claim_type: featured.claimType,
		order_by: ["trending_group", "trending_mixed"],
		page: 1,
		page_size: 20,
		limit_claims_per_channel: 1
	};
	return getQueryPager(localSettings.allowMatureContent ? query : { ...query, not_tags: MATURE_TAGS });
};

source.searchSuggestions = function (query) {
	return [];
};
source.getSearchCapabilities = () => {
	return {
		types: [Type.Feed.Mixed],
		sorts: [Type.Order.Chronological, "^release_time"],
		filters: [
			{
				id: "date",
				name: "Date",
				isMultiSelect: false,
				filters: [
					{ id: Type.Date.Today, name: "Last 24 hours", value: "today" },
					{ id: Type.Date.LastWeek, name: "Last week", value: "thisweek" },
					{ id: Type.Date.LastMonth, name: "Last month", value: "thismonth" },
					{ id: Type.Date.LastYear, name: "Last year", value: "thisyear" }
				]
			},
		]
	};
};
source.search = function (query, type, order, filters) {
	let sort = order;
	if (sort === Type.Order.Chronological) {
		sort = "release_time";
	}

	let date = null;
	if (filters && filters["date"]) {
		date = filters["date"][0];
	}

	return getSearchPagerVideos(query, false, 4, null, sort, date);
};
source.getSearchChannelContentsCapabilities = function () {
	return {
		types: [Type.Feed.Mixed],
		sorts: [Type.Order.Chronological],
		filters: []
	};
};
source.searchChannelContents = function (channelUrl, query, type, order, filters) {
	let { id: channel_id } = parseChannelUrl(channelUrl)

	if (channel_id.length !== CLAIM_ID_LENGTH) {
		const platform_channel = source.getChannel(channelUrl)
		channel_id = platform_channel.id.value
	}

	return getSearchPagerVideos(query, false, 4, channel_id);
};

source.searchChannels = function (query) {
	return getSearchPagerChannels(query, false);
};

//Channel
// examples
// https://odysee.com/@switchedtolinux:0
// https://odysee.com/@switchedtolinux:0?r=CpwgsVwZ2JEgHpGZZcUZGBPSMdKfZWyH
// lbry://@dubdigital#c2079078fa907da862f99c549ecf507d5caeffd3
source.isChannelUrl = function (url) {
	return REGEX_CHANNEL_URL.test(url)
};
function parseChannelUrl(url) {
	const match_result = url.match(REGEX_CHANNEL_URL)

	const slug = match_result[2]
	const id = match_result[4]

	return { slug, id }
}
source.getChannel = function (url) {
	const { slug, id } = parseChannelUrl(url)

	url = `lbry://${slug}#${id}`

	let [channel] = resolveClaimsChannel([url])
	return channel
};
source.getChannelContents = function (url) {
	let { id: channel_id } = parseChannelUrl(url)

	if (channel_id.length !== CLAIM_ID_LENGTH) {
		const platform_channel = source.getChannel(url)
		channel_id = platform_channel.id.value
	}

	const query = {
		channel_ids: [channel_id],
		page: 1,
		page_size: 8,
		claim_type: [CLAIM_TYPE_STREAM],
		order_by: [ORDER_BY_RELEASETIME]
	}

	return getQueryPager(localSettings.allowMatureContent ? query : { ...query, not_tags: MATURE_TAGS });
};
source.getChannelPlaylists = function (url) {
	let { id: channel_id } = parseChannelUrl(url)

	if (channel_id.length !== CLAIM_ID_LENGTH) {
		const platform_channel = source.getChannel(url)
		channel_id = platform_channel.id.value
	}

	// TODO load the first video of each playlist to grab thumbnails
	return new ChannelPlaylistsPager(channel_id, 1, 24)
}

source.getChannelTemplateByClaimMap = () => {
	return {
		//Odysee
		3: {
			0: "lbry://{{CLAIMVALUE}}"
			//Unused! 1: claim id
		}
	};
};

//Video
// examples
// https://odysee.com/We-Are-Anonymous:e
// https://odysee.com/@Anonymous:17/FTS:9
// https://odysee.com/@dubdigital:c/bitcoin-diamond-hands:3e
// https://odysee.com/@switchedtolinux:0/clearing-the-alpine-forest-weekly-news:2?r=CpwgsVwZ2JEgHpGZZcUZGBPSMdKfZWyH
// lbry://bitcoin-diamond-hands#3ef3d55066b9bee1419b538b371b463069c1f1a5
// lbry://@dubdigital#c/bitcoin-diamond-hands#3e
// https://odysee.com/@Questgenics:f/we-are-anonymous.....🎭:9?r=CpwgsVwZ2JEgHpGZZcUZGBPSMdKfZWyH
source.isContentDetailsUrl = function (url) {
	return REGEX_DETAILS_URL.test(url)
};
/**
 * 
 * @param {*} url 
 * @returns channel_slug and channel_id might be undefined
 */
function parseDetailsUrl(url) {
	const match_result = url.match(REGEX_DETAILS_URL)

	const channel_slug = match_result[3]
	const channel_id = match_result[5]

	const video_slug = match_result[6]
	const video_id = match_result[8]

	return { video_slug, video_id, channel_slug, channel_id, }
}
source.getContentDetails = function (url) {
	const { video_slug, video_id } = parseDetailsUrl(decodeURI(url))

	const claim = `lbry://${video_slug}#${video_id}`
	return resolveClaimsVideoDetail([claim])[0];
};

source.getComments = function (url) {
	const videoId = url.split('#')[1];
	return getCommentsPager(url, videoId, 1, true);

}
source.getSubComments = function (comment) {
	if (typeof comment === 'string') {
		comment = JSON.parse(comment);
	}

	return getCommentsPager(comment.contextUrl, comment.context.claimId, 1, false, comment.context.commentId);
}
source.isPlaylistUrl = function (url) {
	return REGEX_PLAYLIST.test(url) || REGEX_COLLECTION.test(url) || REGEX_FAVORITES.test(url) || REGEX_WATCH_LATER.test(url)
}
// TODO return a playlist thumbnail to show on the playlist import screen
source.getPlaylist = function (url) {
	if (REGEX_FAVORITES.test(url)) {
		const response = loadPreferences()

		const playlistId = "favorites"

		const preferences = JSON.parse(response.body)

		const playlist = preferences.result.shared.value.builtinCollections.favorites

		return formatUserPlaylist(playlist, playlistId)
	}
	if (REGEX_WATCH_LATER.test(url)) {
		const playlistId = "watchlater"

		const response = loadPreferences()

		const preferences = JSON.parse(response.body)

		const playlist = preferences.result.shared.value.builtinCollections.watchlater

		return formatUserPlaylist(playlist, playlistId)
	}

	const matchResult = url.match(REGEX_PLAYLIST)
	if (matchResult === null) {
		const playlistId = url.match(REGEX_COLLECTION)[1]

		const response = loadPreferences()

		const preferences = JSON.parse(response.body)

		const playlist = preferences.result.shared.value.unpublishedCollections[playlistId]

		return formatUserPlaylist(playlist, playlistId)
	} else {
		const playlistId = matchResult[1]

		const response = http.POST(
			URL_CLAIM_SEARCH,
			JSON.stringify({ jsonrpc: "2.0", method: "claim_search", params: { include_is_my_output: true, claim_ids: [playlistId], page: 1, page_size: 1, no_totals: true }, id: 1719268918154 }),
			{},
			false
		)
		const playlistMetadata = JSON.parse(response.body).result.items[0]

		return new PlatformPlaylistDetails({
			id: new PlatformID(PLATFORM, playlistId, plugin.config.id, PLATFORM_CLAIMTYPE),
			name: playlistMetadata.value.title,
			author: new PlatformAuthorLink(
				new PlatformID(PLATFORM, playlistMetadata.signing_channel.claim_id, plugin.config.id, PLATFORM_CLAIMTYPE),
				playlistMetadata.signing_channel.value.title,
				playlistMetadata.signing_channel.permanent_url,
				playlistMetadata.signing_channel.value.thumbnail.url
			),
			datetime: playlistMetadata.meta.creation_timestamp,
			url,
			videoCount: playlistMetadata.value.claims.length,
			contents: new VideoPager(resolveClaimsVideo2(playlistMetadata.value.claims), false)
		})
	}
}
function loadPreferences() {
	return http.POST(
		URL_PREFERENCES,
		JSON.stringify({ jsonrpc: "2.0", method: "preference_get", params: { key: "shared" }, id: 1719254704333 }),
		{},
		true
	)
}
function formatUserPlaylist(playlist, playlistId) {
	return new PlatformPlaylistDetails({
		id: new PlatformID(PLATFORM, playlistId, plugin.config.id, PLATFORM_CLAIMTYPE),
		name: playlist.name,
		author: localState.channel === undefined ? EMPTY_AUTHOR : new PlatformAuthorLink(
			new PlatformID(PLATFORM, localState.channel.channelId, plugin.config.id, PLATFORM_CLAIMTYPE),
			localState.channel.name,
			localState.channel.url,
			localState.channel.thumbnail
		),
		datetime: playlist.createdAt,
		url: `${PLAYLIST_URL_BASE}${playlistId}`,
		videoCount: playlist.itemCount,
		contents: new VideoPager(resolveClaimsVideo(playlist.items), false)
	})
}
// i don't think there is a way to search playlists on odysee
// source.searchPlaylists = function (query) {

// }
source.getUserSubscriptions = function () {
	const response = loadPreferences()
	const preferences = JSON.parse(response.body)
	return preferences.result.shared.value.subscriptions
}
source.getUserPlaylists = function () {
	const response = loadPreferences()
	const preferences = JSON.parse(response.body)
	const collections = Object.keys(preferences.result.shared.value.unpublishedCollections)
		.map(function (collectionId) {
			return `${PLAYLIST_URL_BASE}${collectionId}`
		})

	const publicPlaylistsResponse = http.POST(
		URL_COLLECTION_LIST,
		JSON.stringify({ jsonrpc: "2.0", method: "collection_list", params: { resolve: true, page: 1, page_size: 200 }, id: 1719352987252 }),
		{},
		true
	)
	const playlists = JSON.parse(publicPlaylistsResponse.body).result.items.map(function (playlist) {
		return `${PLAYLIST_URL_BASE}${playlist.claim_id}`
	})

	return [...collections, ...playlists, ...["https://odysee.com/$/playlist/watchlater", "https://odysee.com/$/playlist/favorites"]]
}
source.getPlaybackTracker = function (url) {
	if (!localSettings.odyseeActivity) {
		return null
	}
	return new OdyseePlaybackTracker(url)
}
class OdyseePlaybackTracker extends PlaybackTracker {
	constructor(url) {
		const intervalSeconds = 10
		super(intervalSeconds * 1000)

		const { video_slug, video_id, channel_slug, channel_id } = parseDetailsUrl(url)
		if (channel_slug === undefined) {
			this.url = `${video_slug}#${video_id}`
		} else {
			this.url = `${channel_slug}#${channel_id}/${video_slug}#${video_id}`
		}

		this.duration = resolveClaims([url])[0].value.video.duration * 1000

		this.lastMessage = Date.now()
	}
	onInit(_seconds) {


	}
	onProgress(seconds, isPlaying) {
		if (!isPlaying || seconds === 0) {
			return
		}
		http.POST(
			URL_REPORT_PLAYBACK,
			JSON.stringify(
				passthrough_log({
					rebuf_count: 0,
					rebuf_duration: 0,
					url: this.url,
					device: "web",
					duration: Date.now() - this.lastMessage,
					// hardcoded because there isn't a way in grayjay to know this value
					protocol: "hls",
					// not really sure what this means 
					player: "use-p1",
					user_id: localState.userId,
					position: seconds * 1000,
					rel_position: Math.round(seconds * 1000 / this.duration * 100),
					// hardcoded because there isn't a way in grayjay to know the quality playing
					bitrate: 2890800
				})
			),
			{},
			false
		)
		this.lastMessage = Date.now()
	}
	onConcluded() {
		http.POST(
			URL_REPORT_PLAYBACK,
			JSON.stringify(
				passthrough_log({
					rebuf_count: 0,
					rebuf_duration: 0,
					url: this.url,
					device: "web",
					duration: Date.now() - this.lastMessage,
					// hardcoded because there isn't a way in grayjay to know this value
					protocol: "hls",
					// not really sure what this means 
					player: "use-p1",
					user_id: localState.userId,
					position: this.duration,
					rel_position: 100,
					// hardcoded because there isn't a way in grayjay to know the quality playing
					bitrate: 2890800
				})
			),
			{},
			false
		)
		this.lastMessage = Date.now()
		http.POST(
			URL_REPORT_PLAYBACK,
			JSON.stringify(
				passthrough_log({
					rebuf_count: 0,
					rebuf_duration: 0,
					url: this.url,
					device: "web",
					duration: Date.now() - this.lastMessage,
					// hardcoded because there isn't a way in grayjay to know this value
					protocol: "hls",
					// not really sure what this means 
					player: "use-p1",
					user_id: localState.userId,
					position: this.duration,
					rel_position: 100,
					// hardcoded because there isn't a way in grayjay to know the quality playing
					bitrate: 2890800
				})
			),
			{},
			false
		)
	}
}

function getCommentsPager(contextUrl, claimId, page, topLevel, parentId = null) {
	const body = JSON.stringify({
		"jsonrpc": "2.0",
		"id": 1,
		"method": "comment.List",
		"params": {
			"page": page,
			"claim_id": claimId,
			"page_size": 10,
			"top_level": topLevel,
			"sort_by": 3,
			... (parentId ? { "parent_id": parentId } : {})
		}
	});

	const resp = http.POST(URL_COMMENTS_LIST, body, {
		"Content-Type": "application/json"
	});

	if (!resp.isOk) {
		return new CommentPager([], false, {});
	}

	const result = JSON.parse(resp.body);

	//Make optional thumbnail map
	let claimsToQuery = result.result?.items?.map(i => i.channel_id) ?? [];
	claimsToQuery = [...new Set(claimsToQuery)]; //Deduplicate list
	const claimsResp = http.POST(URL_CLAIM_SEARCH, JSON.stringify({
		"jsonrpc": "2.0",
		method: "claim_search",
		params: {
			claim_ids: claimsToQuery,
			no_totals: true,
			page: 1,
			page_size: 20
		}
	}), {
		"Content-Type": "application/json"
	});

	const thumbnailMap = {};
	const claimsResItems = JSON.parse(claimsResp.body)?.result?.items;
	if (claimsResp.isOk && claimsResItems) {
		for (const i of claimsResItems) {
			const url = i.value?.thumbnail?.url;
			if (url) {
				thumbnailMap[i.claim_id] = url;
			}
		}
	}

	//Map comments
	const comments = result.result?.items?.map(i => {
		const c = new Comment({
			contextUrl: contextUrl,
			author: new PlatformAuthorLink(new PlatformID(PLATFORM, i.channel_id, plugin.config.id, PLATFORM_CLAIMTYPE),
				i.channel_name ?? "",
				i.channel_url,
				thumbnailMap[i.channel_id] ?? ""),
			message: i.comment ?? "",
			date: i.timestamp,
			replyCount: i.replies,
			context: { claimId: i.claim_id, commentId: i.comment_id }
		});

		return c;
	}) ?? [];

	const hasMore = result.result.page < result.result.total_pages;
	return new OdyseeCommentPager(comments, hasMore, { claimId, page, topLevel, parentId });
}

//Internals
function getOdyseeContentData() {
	const resp = http.GET(URL_CONTENT, {});
	if (!resp.isOk)
		throw new ScriptException("Failed request [" + URL_CONTENT + "] (" + resp.code + ")");
	const contentResp = JSON.parse(resp.body);

	return contentResp.data["en"];
}
function getQueryPager(query) {
	const initialResults = claimSearch(query);
	return new QueryPager(query, initialResults);
}
function getSearchPagerVideos(query, nsfw = false, maxRetry = 0, channelId = null, sortBy = null, timeFilter = null) {
	const pageSize = 10;
	const results = searchAndResolveVideos(query, 0, pageSize, nsfw, maxRetry, channelId, sortBy, timeFilter);
	return new SearchPagerVideos(query, results, pageSize, nsfw, channelId, sortBy, timeFilter);
}
function getSearchPagerChannels(query, nsfw = false) {
	const pageSize = 10;
	const results = searchAndResolveChannels(query, 0, pageSize, nsfw);
	return new SearchPagerChannels(query, results, pageSize, nsfw);
}


//Pagers
class QueryPager extends VideoPager {
	constructor(query, results) {
		super(results, results.length >= query.page_size, query);
	}

	nextPage() {
		this.context.page = this.context.page + 1;
		return getQueryPager(this.context);
	}
}
function getPlaylists(channelId, nextPageToLoad, pageSize) {
	const params = {
		page_size: pageSize,
		page: nextPageToLoad,
		claim_type: ["collection"],
		no_totals: true,
		order_by: ["release_time"],
		has_source: true,
		channel_ids: [channelId],
		release_time: `<${Date.now}`
	}

	const response = http.POST(
		URL_CLAIM_SEARCH,
		JSON.stringify(
			{
				jsonrpc: "2.0",
				method: "claim_search",
				params: localSettings.allowMatureContent ? params : { ...params, not_tags: MATURE_TAGS },
				id: 1719272697105
			}
		),
		{},
		false
	)

	const playlists = JSON.parse(response.body)

	const formattedPlaylists = playlists.result.items.map(function (playlist) {
		return new PlatformPlaylist({
			id: new PlatformID(PLATFORM, playlist.claim_id, plugin.config.id, PLATFORM_CLAIMTYPE),
			name: playlist.value.title,
			author: new PlatformAuthorLink(
				new PlatformID(PLATFORM, playlist.signing_channel.claim_id, plugin.config.id, PLATFORM_CLAIMTYPE),
				playlist.signing_channel.value.title,
				playlist.signing_channel.permanent_url,
				playlist.signing_channel.value.thumbnail.url
			),
			datetime: playlist.meta.creation_timestamp,
			url: `${PLAYLIST_URL_BASE}${playlist.claim_id}`,
			videoCount: playlist.value.claims.length,
			// thumbnail: string
		})
	})
	return formattedPlaylists
}
class ChannelPlaylistsPager extends PlaylistPager {
	constructor(channelId, firstPage, pageSize) {
		const formatted_playlists = getPlaylists(channelId, firstPage, pageSize)

		// odysee doesn't tell us if there are more we just need to try and return none if there are none
		super(formatted_playlists, formatted_playlists.length === pageSize)

		this.channelId = channelId
		this.nextPageToLoad = firstPage + 1
		this.pageSize = pageSize
	}
	nextPage() {
		const formatted_playlists = getPlaylists(this.channelId, this.nextPageToLoad, this.pageSize)

		this.results = formatted_playlists
		this.nextPageToLoad += 1
		this.hasMore = formatted_playlists.length === this.pageSize

		return this
	}
}
class SearchPagerVideos extends VideoPager {
	constructor(searchStr, results, pageSize, nsfw = false, channelId = null, sortBy = null, timeFilter = null) {
		super(results, results.length >= pageSize, {
			query: searchStr,
			page_size: pageSize,
			nsfw: nsfw,
			page: 0,
			channelId,
			sortBy,
			timeFilter
		});
	}

	nextPage() {
		this.context.page = this.context.page + 1;
		const start = (this.context.page - 1) * this.context.page_size;
		const end = (this.context.page) * this.context.page_size;

		this.results = searchAndResolveVideos(this.context.query, start, this.context.page_size, this.context.nsfw, 5, this.context.channelId, this.context.sortBy, this.context.timeFilter);
		if (this.results.length == 0)
			this.hasMore = false;

		return this;
	}
}
class SearchPagerChannels extends ChannelPager {
	constructor(searchStr, results, pageSize, nsfw = false) {
		super(results, results.length >= pageSize, {
			query: searchStr,
			page_size: pageSize,
			nsfw: nsfw,
			page: 0
		});
	}

	nextPage() {
		this.context.page = this.context.page + 1;
		const start = (this.context.page - 1) * this.context.page_size;
		const end = (this.context.page) * this.context.page_size;

		this.results = searchAndResolveChannels(this.context.query, start, this.context.page_size, this.nsfw);
		if (this.results.length == 0)
			this.hasMore = false;

		return this;
	}
}

class OdyseeCommentPager extends CommentPager {
	constructor(results, hasMore, context) {
		super(results, hasMore, context);
	}

	nextPage() {
		return getCommentsPager(this.context.contextUrl, this.context.claimId, this.context.page + 1, this.context.topLevel, this.context.parentId);
	}
}

//Internal methods
function searchAndResolveVideos(search, from, size, nsfw = false, maxRetry = 0, channelId = null, sortBy = null, timeFilter = null) {
	const claimUrls = searchClaims(search, from, size, "file", nsfw, maxRetry, 0, channelId, sortBy, timeFilter);
	return resolveClaimsVideo(claimUrls);
}
function searchAndResolveChannels(search, from, size, nsfw = false) {
	const claimUrls = searchClaims(search, from, size, "channel", nsfw, 4);
	return resolveClaimsChannel(claimUrls);
}
function searchClaims(search, from, size, type = "file", nsfw = false, maxRetry = 0, ittRetry = 0, channelId = null, sortBy = null, timeFilter = null) {
	let url = "https://lighthouse.odysee.tv/search?s=" + encodeURIComponent(search) +
		"&from=" + from + "&size=" + size + "&nsfw=" + nsfw;// + "&claimType=file&mediaType=video"

	if (type == "file")
		url += "&claimType=file&mediaType=video";
	else
		url += "&claimType=" + type;

	if (channelId) {
		url += "&channel_id=" + channelId;
	}

	if (sortBy) {
		url += "&sort_by=" + sortBy;
	}

	if (timeFilter) {
		url += "&time_filter=" + timeFilter;
	}

	log(url);

	const respSearch = http.GET(url, {});

	if (respSearch.code >= 300) {
		if (respSearch.code == 502 || (respSearch.body && respSearch.body.indexOf("1020") > 0)) {
			if (ittRetry < maxRetry) {
				log("Retry searchClaims [" + ittRetry + "]");
				return searchClaims(search, from, size, type, nsfw, maxRetry, ittRetry + 1);
			}
			else {
				log("Retrying searchClaims failed after " + ittRetry + " attempts");
				return [];
			}
		}

		if (respSearch.code == 408) {
			log("Odysee failed with timeout after retries");
			return [];
		}
		else
			throw new ScriptException("Failed to search with code " + respSearch.code + "\n" + respSearch.body);
	}
	if (respSearch.body == null || respSearch.body == "") {
		throw new ScriptException("Failed to search with code " + respSearch.code + " due to empty body")
	}

	const claims = JSON.parse(respSearch.body);
	const claimUrls = claims.map(x => x.name + "#" + x.claimId);
	return claimUrls;
}

function claimSearch(query) {
	const body = JSON.stringify({
		method: "claim_search",
		params: query
	});
	const resp = http.POST(URL_CLAIM_SEARCH, body, {
		"Content-Type": "application/json"
	});
	if (resp.code >= 300)
		throw "Failed to search claims\n" + resp.body;
	const result = JSON.parse(resp.body);
	return result.result.items.map((x) => lbryVideoToPlatformVideo(x));
}

function resolveClaimsChannel(claims) {
	if (!Array.isArray(claims) || claims.length === 0)
		return [];
	const results = resolveClaims(claims);
	const batch = http.batch();

	// getsub count using batch request
	results.forEach(claim => {
		batch.POST(
			`${URL_API_SUB_COUNT}?claim_id=${claim.claim_id}`,
			`auth_token=${localState.auth_token}&claim_id=${claim.claim_id}`,
			{ 'Content-Type': 'application/x-www-form-urlencoded' }
		);
	});

	const responses = batch.execute();

	const responseMap = responses.reduce((map, resp) => {
		try {
			const url = new URL(resp.url);
			const claimId = url.searchParams.get('claim_id');
			if (claimId && resp.isOk) {
				map[claimId] = resp;
			}
		} catch (error) {
			console.error(`Error parsing response URL:`, error);
		}
		return map;
	}, {});

	return results.map(channel => {
		try {
			const response = responseMap[channel.claim_id];
			const subCount = response
				? JSON.parse(response.body)?.data?.[0] ?? 0
				: 0;
			return lbryChannelToPlatformChannel(channel, subCount);
		} catch (error) {
			console.error(`Error processing channel ${channel.claim_id}:`, error);
			return lbryChannelToPlatformChannel(channel, 0);
		}
	});
}
function resolveClaimsVideo(claims) {
	if (!claims || claims.length == 0)
		return [];
	const results = resolveClaims(claims);
	return results.map(x => lbryVideoToPlatformVideo(x));
}
function resolveClaimsVideo2(claims) {
	if (!claims || claims.length == 0)
		return [];
	const results = resolveClaims2(claims);
	return results.map(x => lbryVideoToPlatformVideo(x));
}
function resolveClaimsVideoDetail(claims) {
	if (!claims || claims.length == 0)
		return [];
	const results = resolveClaims(claims);
	if (!localSettings.allowMatureContent) {
		results?.forEach((result => {
			result.value?.tags?.forEach((tag) => {
				if (MATURE_TAGS.includes(tag)) {
					throw new AgeException("Mature content is not supported on Odysee");
				}
			})
		}))
	}
	return results.map(x => lbryVideoDetailToPlatformVideoDetails(x));
}
function resolveClaims(claims) {
	const body = JSON.stringify({
		method: "resolve",
		params: {
			urls: claims
		}
	});
	const resp = http.POST(URL_RESOLVE, body, {
		"Content-Type": "application/json"
	});
	if (resp.code >= 300)
		throw "Failed to resolve claims\n" + resp.body;

	const claimResults = JSON.parse(resp.body).result;

	const results = [];
	for (let i = 0; i < claims.length; i++) {
		const claim = claims[i];
		if (claimResults[claim])
			results.push(claimResults[claim]);
	}
	return results;
}
function resolveClaims2(claims) {
	const body = JSON.stringify(
		{ jsonrpc: "2.0", method: "claim_search", params: { claim_ids: claims, page: 1, page_size: claims.length, no_totals: true }, id: 1719330225903 }
	)
	const resp = http.POST(URL_RESOLVE, body, {
		"Content-Type": "application/json"
	});
	if (resp.code >= 300)
		throw "Failed to resolve claims\n" + resp.body;

	const claimResults = JSON.parse(resp.body).result;

	const results = [];
	claimResults.items.forEach(function (claim) {
		results[claims.indexOf(claim.claim_id)] = claim
	})
	return results
}


//Convert a LBRY Channel (claim) to a PlatformChannel
function lbryChannelToPlatformChannel(lbry, subs = 0) {
	return new PlatformChannel({
		id: new PlatformID(PLATFORM, lbry.claim_id, plugin.config.id, PLATFORM_CLAIMTYPE),
		name: lbry.value?.title ?? "",
		thumbnail: lbry.value?.thumbnail?.url ?? "",
		banner: lbry.value?.cover?.url,
		subscribers: subs,
		description: lbry.value?.description ?? "",
		url: lbry.permanent_url,
		links: {}
	});
}

//Convert a LBRY Video (claim) to a PlatformVideo
function lbryVideoToPlatformVideo(lbry) {
	const shareUrl = lbry.signing_channel?.claim_id !== undefined
		? format_odysee_share_url(lbry.signing_channel.name, lbry.signing_channel.claim_id, lbry.name, lbry.claim_id)
		: format_odysee_share_url_anonymous(lbry.name, lbry.claim_id.slice(0, 1))

	return new PlatformVideo({
		id: new PlatformID(PLATFORM, lbry.claim_id, plugin.config.id),
		name: lbry.value?.title ?? "",
		thumbnails: new Thumbnails([new Thumbnail(lbry.value?.thumbnail?.url, 0)]),
		author: new PlatformAuthorLink(new PlatformID(PLATFORM, lbry.signing_channel?.claim_id, plugin.config.id, PLATFORM_CLAIMTYPE),
			lbry.signing_channel?.value?.title ?? "",
			lbry.signing_channel?.permanent_url ?? "",
			lbry.signing_channel?.value?.thumbnail?.url ?? ""),
		datetime: parseInt(lbry.value.release_time),
		duration: lbry.value?.video?.duration ?? 0,
		viewCount: -1,
		url: lbry.permanent_url,
		shareUrl,
		isLive: false
	});
}
function format_odysee_share_url_anonymous(video_name, video_claim_id) {
	return `${URL_BASE}/${video_name}:${video_claim_id.slice(0, 1)}`
}
function format_odysee_share_url(channel_name, channel_claim_id, video_name, video_claim_id) {
	return `${URL_BASE}/${channel_name}:${channel_claim_id.slice(0, 1)}/${video_name}:${video_claim_id.slice(0, 1)}`
}
//Convert an LBRY Video to a PlatformVideoDetail
function lbryVideoDetailToPlatformVideoDetails(lbry) {
	const headersToAdd = {
		"Origin": "https://odysee.com"
	}

	log(lbry)

	if (lbry.value?.video === undefined) {
		throw new UnavailableException("Odysee live streams are not currently supported")
	}

	const sdHash = lbry.value?.source?.sd_hash;
	let source = null;
	if (sdHash) {
		const sources = [];

		const hlsUrl2 = `https://player.odycdn.com/v6/streams/${lbry.claim_id}/${sdHash}/master.m3u8`;
		const hlsResponse2 = http.GET(hlsUrl2, headersToAdd);
		if (hlsResponse2.isOk) {
			sources.push(new HLSSource({
				name: "HLS (v6)",
				url: hlsUrl2,
				duration: lbry.value?.video?.duration ?? 0,
				priority: true,
				requestModifier: {
					headers: headersToAdd
				}
			}));
		} else {
			const hlsUrl = `https://player.odycdn.com/api/v4/streams/tc/${lbry.name}/${lbry.claim_id}/${sdHash}/master.m3u8`;
			const hlsResponse = http.GET(hlsUrl, headersToAdd);
			if (hlsResponse.isOk) {
				sources.push(new HLSSource({
					name: "HLS",
					url: hlsUrl,
					duration: lbry.value?.video?.duration ?? 0,
					priority: true,
					requestModifier: {
						headers: headersToAdd
					}
				}));
			}
		}

		const downloadUrl2 = `https://player.odycdn.com/v6/streams/${lbry.claim_id}/${sdHash.substring(0, 6)}.mp4`;
		console.log("downloadUrl2", downloadUrl2);
		const downloadResponse2 = http.GET(downloadUrl2, { "Range": "bytes=0-10", ...headersToAdd });
		if (downloadResponse2.isOk) {
			sources.push(new VideoUrlSource({
				name: "Original " + (lbry.value?.video?.height ?? 0) + "P (v6)",
				url: downloadUrl2,
				width: lbry.value?.video?.width ?? 0,
				height: lbry.value?.video?.height ?? 0,
				duration: lbry.value?.video?.duration ?? 0,
				container: downloadResponse2.headers["content-type"]?.[0] ?? "video/mp4",
				requestModifier: {
					headers: headersToAdd
				}
			}));
		} else {
			const downloadUrl = `https://player.odycdn.com/api/v4/streams/free/${lbry.name}/${lbry.claim_id}/${sdHash.substring(0, 6)}`;
			const downloadResponse = http.GET(downloadUrl, { "Range": "bytes=0-0", ...headersToAdd });
			if (downloadResponse.isOk) {
				sources.push(new VideoUrlSource({
					name: "Original " + (lbry.value?.video?.height ?? 0) + "P (v4)",
					url: downloadUrl,
					width: lbry.value?.video?.width ?? 0,
					height: lbry.value?.video?.height ?? 0,
					duration: lbry.value?.video?.duration ?? 0,
					container: downloadResponse.headers["content-type"]?.[0] ?? "video/mp4",
					requestModifier: {
						headers: headersToAdd
					}
				}));
			}
		}

		if (sources.length === 0) {
			throw new UnavailableException("Members Only Content Is Not Currently Supported")
		}

		source = {
			video: new VideoSourceDescriptor(sources)
		};
	} else {
		source = {
			video: new VideoSourceDescriptor([
				new VideoUrlSource({
					name: "Original " + (lbry.value?.video?.height ?? 0) + "P",
					url: "https://cdn.lbryplayer.xyz/content/claims/" + lbry.name + "/" + lbry.claim_id + "/stream",
					width: lbry.value?.video?.width ?? 0,
					height: lbry.value?.video?.height ?? 0,
					duration: lbry.value?.video?.duration ?? 0,
					container: lbry.value?.source?.media_type ?? "",
					requestModifier: {
						headers: headersToAdd
					}
				})
			])
		};
	}

	if (IS_TESTING)
		console.log(lbry);

	let rating = null;
	let viewCount = 0;
	let subCount = 0;

	const headers = {
		"Content-Type": "application/x-www-form-urlencoded"
	};

	const [reactionResp, viewCountResp, subCountResp] = http
		.batch()
		.POST(URL_REACTIONS, `auth_token=${localState.auth_token}&claim_ids=${lbry.claim_id}`, headers)
		.POST(URL_VIEW_COUNT, `auth_token=${localState.auth_token}&claim_id=${lbry.claim_id}`, headers)
		.POST(URL_API_SUB_COUNT, `auth_token=${localState.auth_token}&claim_id=${lbry.signing_channel.claim_id}`, headers)
		.execute();

	if (reactionResp && reactionResp.isOk) {
		const reactionObj = JSON.parse(reactionResp.body);
		if (reactionObj && reactionObj.success && reactionObj.data && reactionObj.data.others_reactions) {
			const robj = reactionObj.data.others_reactions[lbry.claim_id];
			if (robj) {
				rating = new RatingLikesDislikes(robj.like ?? 0, robj.dislike ?? 0);
			}
		}
	}


	if (viewCountResp && viewCountResp.isOk) {
		const viewCountObj = JSON.parse(viewCountResp.body);
		if (viewCountObj && viewCountObj.success && viewCountObj.data) {
			viewCount = viewCountObj.data[0] ?? 0;
		}
	}

	if (subCountResp && subCountResp.isOk) {
		const subCountObj = JSON.parse(subCountResp.body);
		if (subCountObj && subCountObj.success && subCountObj.data) {
			subCount = subCountObj.data[0] ?? 0;
		}
	}

	const shareUrl = lbry.signing_channel?.claim_id !== undefined
		? format_odysee_share_url(lbry.signing_channel.name, lbry.signing_channel.claim_id, lbry.name, lbry.claim_id)
		: format_odysee_share_url_anonymous(lbry.name, lbry.claim_id.slice(0, 1))

	return new PlatformVideoDetails({
		id: new PlatformID(PLATFORM, lbry.claim_id, plugin.config.id),
		name: lbry.value?.title ?? "",
		thumbnails: new Thumbnails([new Thumbnail(lbry.value?.thumbnail?.url, 0)]),
		author: new PlatformAuthorLink(new PlatformID(PLATFORM, lbry.signing_channel?.claim_id, plugin.config.id, PLATFORM_CLAIMTYPE),
			lbry.signing_channel?.value?.title ?? "",
			lbry.signing_channel?.permanent_url,
			lbry.signing_channel?.value?.thumbnail?.url ?? "",
			subCount),
		datetime: parseInt(lbry.value.release_time),
		duration: lbry.value?.video?.duration ?? 0,
		viewCount,
		url: lbry.permanent_url,
		shareUrl,
		isLive: false,
		description: lbry.value?.description ?? "",
		rating,
		...source
	});
}

const getAuthInfo = function () {

	const headersToAdd = {
		"Origin": "https://odysee.com"
	}

	const newUserResp = http.GET(URL_USER_NEW, headersToAdd);

	if (newUserResp && newUserResp.isOk) {
		const newUserObj = JSON.parse(newUserResp.body);
		if (newUserObj && newUserObj.success && newUserObj.data) {

			const auth_token = newUserObj.data.auth_token;
			const userId = newUserObj.data.id;

			return { auth_token: auth_token, userId: userId };
		}
	}
}


/** From https://github.com/OdyseeTeam/odysee-frontend/blob/master/ui/constants/tags.js */
const MATURE_TAGS = [
	"porn",
	"porno",
	"nsfw",
	"mature",
	"xxx",
	"sex",
	"creampie",
	"blowjob",
	"handjob",
	"vagina",
	"boobs",
	"big boobs",
	"big dick",
	"pussy",
	"cumshot",
	"anal",
	"hard fucking",
	"ass",
	"fuck",
	"hentai",
]

console.log("LOADED");