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
const URL_GET = "https://api.na-backend.odysee.com/api/v1/proxy?m=get";
const URL_CHANNEL_SIGN = "https://api.na-backend.odysee.com/api/v1/proxy?m=channel_sign";
const URL_STATUS = "https://api.na-backend.odysee.com/api/v2/status"
const URL_REPORT_PLAYBACK = "https://watchman.na-backend.odysee.com/reports/playback"
const URL_BASE = "https://odysee.com";
const URL_API_SUB_COUNT = 'https://api.odysee.com/subscription/sub_count';
const PLAYLIST_URL_BASE = "https://odysee.com/$/playlist/"

const CLAIM_TYPE_STREAM = "stream";
const CLAIM_TYPE_REPOST = "repost";
const ORDER_BY_RELEASETIME = "release_time";

const MEDIA_CONTENT_TYPE = 1;

const REGEX_DETAILS_URL = /^(https:\/\/(?:odysee\.com|open\.lbry\.com)\/|lbry:\/\/)((@[^\/@]+)(:|#)([a-fA-F0-9]+)\/)?([^\/@]+)(:|#)([a-fA-F0-9]+)(\?|$)/
const REGEX_CHANNEL_URL = /^(https:\/\/(?:odysee\.com|open\.lbry\.com)\/|lbry:\/\/)(@[^\/@]+)(:|#)([a-fA-F0-9]+)(\?|$)/
const REGEX_PLAYLIST = /^https:\/\/odysee\.com\/\$\/playlist\/([0-9a-fA-F]+?)$/
const REGEX_COLLECTION = /^https:\/\/odysee\.com\/\$\/playlist\/([0-9a-fA-F-]+?)$/
const REGEX_FAVORITES = /^https:\/\/odysee\.com\/\$\/playlist\/favorites$/
const REGEX_WATCH_LATER = /^https:\/\/odysee\.com\/\$\/playlist\/watchlater$/

const CLAIM_ID_LENGTH = 40

const PLATFORM = "Odysee";
const PLATFORM_CLAIMTYPE = 3;

const EMPTY_AUTHOR = new PlatformAuthorLink(new PlatformID(PLATFORM, "", plugin.config.id), "Anonymous", "","https://plugins.grayjay.app/Odysee/OdyseeIcon.png")

let localState = {
	batch_response_cache: {}
};
let localSettings
let localConfig = {};
let shortContentThresholdOptions = [];

const headersToAdd = {
    'origin': 'https://odysee.com',
    'referer': 'https://odysee.com/',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0'
}

const TEXT_DOC_TYPES = [
    'text/plain',
    'text/markdown',
    'text/html',
    'text/css',
    'text/javascript',
    'text/csv',
    'text/xml',
    'application/json'
];

const IS_ANDROID = bridge.buildPlatform === "android";
const IS_DESKTOP = bridge.buildPlatform === "desktop";

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
	localSettings = settings;
	localConfig = config;

	shortContentThresholdOptions = loadOptionsForSetting('shortContentThresholdIndex');

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

			if(channel) {
				channel.signatureData = channelSign(channel.channelId, `@${channel.name}`);
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
		page_size: getSettingPageSize(),
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

source.getChannelCapabilities = () => {
	return {
		types: [Type.Feed.Videos, Type.Feed.Shorts],
		sorts: []
	};
}

source.getChannelContents = function (url, type) {
    let { id: channel_id } = parseChannelUrl(url)
    if (channel_id.length !== CLAIM_ID_LENGTH) {
        const platform_channel = source.getChannel(url)
        channel_id = platform_channel.id.value
    }
    
    const shortContentThreshold = parseInt(shortContentThresholdOptions[localSettings.shortContentThresholdIndex] || 60);
    
    // Base query parameters common to all queries
    const baseQuery = {
        channel_ids: [channel_id],
        claim_type: [CLAIM_TYPE_STREAM, CLAIM_TYPE_REPOST],
        order_by: [ORDER_BY_RELEASETIME],
        has_source: true,
        release_time: `<${Math.floor(Date.now() / 1000)}`, // Add current timestamp as release_time upper bound
        page: 1,
        page_size: getSettingPageSize()
    };
    
    // Add mature content filter if needed
    if (!localSettings.allowMatureContent) {
        baseQuery.not_tags = MATURE_TAGS;
    }
    
    switch(type) {
        case Type.Feed.Shorts:
            // For shorts, only fetch short videos at the API level
            return createMultiSourcePager([
                {
                    // Short videos only - using just the upper bound
                    request_body: {
                        ...baseQuery,
                        stream_types: ["video"],
                        duration: [`<=${shortContentThreshold}`]
                    },
                    feedType: type
                }
            ]).nextPage();
        
        case Type.Feed.Videos:
        case Type.Feed.Mixed:
        case undefined:
        case null:
        case "":
        default:
            // For all other feed types, fetch all content without stream_type filtering
            // and apply client-side filtering as needed
            return createMultiSourcePager([
                {
                    // All content without stream_type filtering
                    request_body: baseQuery,
                    feedType: type
                }
            ]).nextPage();
    }
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

	const claim_short_url = `lbry://${video_slug}#${video_id}`

	const [claim] = resolveClaims([claim_short_url]);
	const isMembersOnly = getIsMemberOnlyClaim(claim)
	
	if (!localSettings.allowMatureContent) {
		claim.value?.tags?.forEach((tag) => {
			if (MATURE_TAGS.includes(tag)) {
				throw new AgeException("Mature content is not supported on Odysee");
			}
		})
	}
	
	let result = lbryVideoDetailToPlatformVideoDetails(claim);

	result.getContentRecommendations = function () {
		return source.getContentRecommendations(claim_short_url, { claim_id: result.id.value, title: result.name });
	};


	result.getComments = function () {
		return source.getComments(url, isMembersOnly);
	}

	if(IS_TESTING) {
		result.getContentRecommendations();
	}

	return result;
};

source.getContentRecommendations = (url, initialData) => {

	let claim_id = '';
	let query = '';

	if(initialData && initialData.claim_id && initialData.title) {
		claim_id = initialData.claim_id;
		query = initialData.title;
	} else {
		const [result] = resolveClaims([url]);
		claim_id = result.claim_id;
		query = result.value.title;
	}

	const params = objectToUrlEncodedString({
		s: query,
		related_to: claim_id,
		from: 0,
		size: 10,
		free_only: true,
		nsfw: localSettings.allowMatureContent,
		user_id: localState.userId,
		uid: localState.userId
	});

	const relatedResponse = http.GET(`https://recsys.odysee.tv/search?${params}`, {});

	if(relatedResponse.isOk) {
		const body = JSON.parse(relatedResponse.body);
		const claim_ids = body.map(e => e.claimId);

		const contentPager = claimSearch({
			claim_ids: claim_ids,
			no_totals: true,
			page: 1,
			page_size: 20
		});

		return new ContentPager(contentPager, false)
	}

	return new ContentPager([], false);
}

source.getComments = function (url, isMembersOnly=false) {
	const videoId = url.split('#')[1];
	return getCommentsPager(url, videoId, 1, true, null, isMembersOnly);

}
source.getSubComments = function (comment) {
	if (typeof comment === 'string') {
		comment = JSON.parse(comment);
	}

	return getCommentsPager(comment.contextUrl, comment.context.claimId, 1, false, comment.context.commentId, comment.context.isMembersOnly == "true");
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

function getSettingPageSize() {
	return localSettings.extraRequestToLoadViewCount ? 10 : 20
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

		const { video_slug, video_id } = parseDetailsUrl(decodeURI(url))

		const claim_short_url = `lbry://${video_slug}#${video_id}`

		const [claim] = resolveClaims([claim_short_url]);

		this.url = claim.canonical_url.replace('lbry://','');

		this.duration = (claim?.value?.video?.duration ?? 0) * 1000;

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
					user_id: localState.userId.toString(),
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

function getCommentsPager(contextUrl, claimId, page, topLevel, parentId = null, isMembersOnly) {

	if(!isMembersOnly) {
		isMembersOnly = false;
	}
	
	const query = {
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
	};

	// currently only accounts with channels can see and add comments on members only content
	if(isMembersOnly && bridge.isLoggedIn() && localState.channel) {
		//required for members-only content
		query.params.is_protected = true;
		query.params.requestor_channel_id = localState.channel.channelId;
		query.params.requestor_channel_name	 = `@${localState.channel.name}`;
		query.params.signature = localState.channel.signatureData.signature;
		query.params.signing_ts	= localState.channel.signatureData.signing_ts;
	}
	
	const body = JSON.stringify(query);

	const resp = http.POST(URL_COMMENTS_LIST, body, {
		"Content-Type": "application/json"
	}, isMembersOnly);

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
	}, isMembersOnly);

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
			context: { claimId: i.claim_id, commentId: i.comment_id, isMembersOnly: isMembersOnly.toString() }
		});

		return c;
	}) ?? [];

	const hasMore = (result?.result?.page ?? 0) < (result?.result?.total_pages ?? 1);
	return new OdyseeCommentPager(comments, hasMore, { claimId, page, topLevel, parentId, isMembersOnly: isMembersOnly });
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
		// updated Hasmore condition since some unsupported content types may be hidden and would break the pagination
		super(results, !!results.length, { query });
	}

	nextPage() {
		this.context.query.page = (this.context.query.page || 0) + 1;
		return getQueryPager(this.context.query);
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
		return getCommentsPager(this.context.contextUrl, this.context.claimId, this.context.page + 1, this.context.topLevel, this.context.parentId, this.context.isMembersOnly);
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

/**
 * Converts LBRY claim search results to platform content objects
 * @param {Array} items - The items returned from a claim_search API call
 * @returns {Array} Array of platform content objects (videos, audio, documents)
 */
function claimSearchItemsToPlatformContent(items) {
    // Define stream types to process
    const media_stream_types = ['audio', 'video'];
    const docs_stream_types = ['document'];
    
    // Process media types (audio, video)
    let mediaItems = items.filter(z => z.value && media_stream_types.includes(z.value.stream_type));
    let media = lbryVideosToPlatformVideos(mediaItems);
    
    // Process documents
    let documents = [];
    let documentItems = items.filter(z => z.value && docs_stream_types.includes(z.value.stream_type));

    if (documentItems.length) {
        // Separate text documents from binary documents
        const textDocItems = documentItems.filter(z => 
            z.value?.source?.media_type && 
            TEXT_DOC_TYPES.includes(z.value.source.media_type)
        );
        
        // All other document types are treated as binary
        const binaryDocItems = documentItems.filter(z => 
            !z.value?.source?.media_type || 
            !TEXT_DOC_TYPES.includes(z.value.source.media_type)
        );
        
        // Process binary documents with the binary handler
        const binaryDocs = binaryDocItems.map(item => {
            return lbryBinaryDocToPlatformPost(item);
        });
        
        // Process text document types normally
        let documents_body_batch_request = http.batch();
        textDocItems.forEach(lbry => {
            const sdHash = lbry.value?.source?.sd_hash;
            if (sdHash) {
                const sdHashPrefix = sdHash.substring(0, 6);
                documents_body_batch_request.GET(`https://player.odycdn.com/v6/streams/${lbry.claim_id}/${sdHashPrefix}.mp4`, headersToAdd);
            }
        });
        
        let textDocs = [];
        if (textDocItems.length > 0) {
            let documents_response = documents_body_batch_request.execute();
            textDocs = textDocItems.map((x, index) => {
                if (x.value?.source?.sd_hash) {
                    const postContent = documents_response[index].isOk ? documents_response[index].body : undefined;
                    return lbryDocumentToPlatformPost(x, postContent);
                }
                // If there's no sd_hash, return an empty document with error message
                return lbryDocumentToPlatformPost(x, "Content unavailable");
            });
        }
        
        // Combine all document types
        documents = [...binaryDocs, ...textDocs];
    }
    
    // Combine all results and sort by date
    return [...media, ...documents].sort((a, b) => b.datetime - a.datetime);
}

/**
 * Updated claimSearch function that handles PDFs by creating HTML content with a PDF viewer link
 */
function claimSearch(query) {
    const body = JSON.stringify({
        jsonrpc: "2.0",
        method: "claim_search",
        params: query,
        id: Date.now()
    });
    
    const resp = http.POST(URL_CLAIM_SEARCH, body, {
        "Content-Type": "application/json"
    });
    
    if (resp.code >= 300)
        throw new ScriptException("Failed to search claims\n" + resp.body);
    
    const result = JSON.parse(resp.body);
    const items = result.result.items;
    
    // Define stream types to process
    const media_stream_types = ['audio', 'video'];
    const docs_stream_types = ['document'];
    
    // Process media types (audio, video)
    let mediaItems = items.filter(z => z.value && media_stream_types.includes(z.value.stream_type));
    let media = lbryVideosToPlatformVideos(mediaItems);
    
    // Process documents
    let documents = [];
    let documentItems = items.filter(z => z.value && docs_stream_types.includes(z.value.stream_type));
    
    if (documentItems.length) {
        // Separate text documents from binary documents
        const textDocItems = documentItems.filter(z => 
            z.value?.source?.media_type && 
            TEXT_DOC_TYPES.includes(z.value.source.media_type)
        );
        
        // All other document types are treated as binary
        const binaryDocItems = documentItems.filter(z => 
            !z.value?.source?.media_type || 
            !TEXT_DOC_TYPES.includes(z.value.source.media_type)
        );
        
        // Process binary documents with the binary handler
        const binaryDocs = binaryDocItems.map(item => {
            return lbryBinaryDocToPlatformPost(item);
        });
        
        // Process text document types normally
        let documents_body_batch_request = http.batch();
        textDocItems.forEach(lbry => {
            const sdHash = lbry.value?.source?.sd_hash;
            if (sdHash) {
                const sdHashPrefix = sdHash.substring(0, 6);
                documents_body_batch_request.GET(`https://player.odycdn.com/v6/streams/${lbry.claim_id}/${sdHashPrefix}.mp4`, headersToAdd);
            }
        });
        
        let textDocs = [];
        if (textDocItems.length > 0) {
            let documents_response = documents_body_batch_request.execute();
            textDocs = textDocItems.map((x, index) => {
                if (x.value?.source?.sd_hash) {
                    const postContent = documents_response[index].isOk ? documents_response[index].body : undefined;
                    return lbryDocumentToPlatformPost(x, postContent);
                }
                // If there's no sd_hash, return an empty document with error message
                return lbryDocumentToPlatformPost(x, "Content unavailable");
            });
        }
        
        // Combine all document types
        documents = [...binaryDocs, ...textDocs];
    }
    
    // Combine all results and sort by date
    return [...media, ...documents].sort((a, b) => b.datetime - a.datetime);
}

/**
 * Converts binary documents to a platform post with an embedded viewer
 * @param {Object} lbry - The LBRY claim object for a PDF file
 * @returns {PlatformPostDetails} Platform post with embedded PDF viewer
 */
function lbryBinaryDocToPlatformPost(lbry) {
	
	const claimId = lbry.claim_id;
	const name = lbry.name;

    const shareUrl = lbry.signing_channel?.claim_id !== undefined
        ? format_odysee_share_url(lbry.signing_channel.name, lbry.signing_channel.claim_id, name, claimId)
        : format_odysee_share_url_anonymous(name, claimId.slice(0, 1));
    
    const sdHash = lbry.value?.source?.sd_hash;
    const sdHashPrefix = sdHash ? sdHash.substring(0, 6) : "";
    
    // Create a direct download URL for the document
    const downloadUrl = `https://player.odycdn.com/v6/streams/${claimId}/${sdHashPrefix}.mp4`;
    
    // Create HTML content with download link
    const htmlContent = `
        <div>
			<a href="${downloadUrl}" target="_blank" style="display: inline-block; background-color: #2196F3; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px; margin-right: 10px;">
				<strong>View/Download File</strong>
			</a>
        </div>
    `;
    
    const {
        rating,
        subCount
    } = lbryToMetrics(lbry, { loadSubCount: true, loadRating: true });
    
    return new PlatformPostDetails({
        id: new PlatformID(PLATFORM, claimId, plugin.config.id),
        name: lbry.value?.title ?? name,
        author: channelToPlatformAuthorLink(lbry, subCount),
        datetime: lbryVideoToDateTime(lbry),
        url: shareUrl,
        rating: rating,
        textType: Type.Text.HTML,
        content: htmlContent,
        images: lbry.value?.thumbnail?.url ? [lbry.value?.thumbnail?.url] : [],
        thumbnails: lbry.value?.thumbnail?.url ? [new Thumbnails([new Thumbnail(lbry.value?.thumbnail?.url, 0)])] : [],
    });
}

function resolveClaimsChannel(claims) {
	if (!Array.isArray(claims) || claims.length === 0)
		return [];
	const results = resolveClaims(claims);

	// getsub count using batch request
	const requests = results.map(claim => {
		return {
			url: `${URL_API_SUB_COUNT}?claim_id=${claim.claim_id}`,
			body: `auth_token=${localState.auth_token}&claim_id=${claim.claim_id}`,
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		};
	});

	const responses = batchRequest(requests, { useStateCache: true });

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
	return lbryVideosToPlatformVideos(results);
}
function resolveClaimsVideo2(claims) {
	if (!claims || claims.length == 0)
		return [];
	const results = resolveClaims2(claims);
	return lbryVideosToPlatformVideos(results);
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

	let description = lbry.value?.description ?? "";

	let lineSeparator = getLineBreakCharacter();

	if(lbry?.value?.email) {
		description += `${lineSeparator}Contact: ${lbry.value.email}`;
	}

	if(lbry?.value?.website_url)
	{
		description += `${lineSeparator}Site: ${lbry.value.website_url}`;	
	}

	if(lbry?.value?.tags) {
		description += `${lineSeparator}Tags: ${lbry.value.tags.join(", ")}`;
	}

	if(lbry?.value?.languages?.length) {
		
		let languages = lbry.value.languages.map(languageCode => {
			return LANGUAGE_CODES[languageCode] ?? languageCode;
		});

		if(languages.length) {
			description += `${lineSeparator}Languages: ${languages.join(", ")}`;
		}
	}

	if(lbry?.meta?.claims_in_channel) {
		description += `${lineSeparator}Total Uploads: ${lbry.meta.claims_in_channel}`;
	}

	if(lbry?.meta?.creation_timestamp) {
		description += `${lineSeparator}Created At: ${new Date(lbry.meta.creation_timestamp * 1000).toLocaleDateString()}`;
	}

	if(lbry.canonical_url) {
		description += `${lineSeparator}URL: ${lbry.canonical_url}`;
	}
	
	if(lbry.claim_id) {
		description += `${lineSeparator}Claim ID: ${lbry.claim_id}`;
	}

	if(lbry?.meta?.effective_amount) {
		description += `${lineSeparator}Staked Credits: ${lbry.meta.effective_amount} LBC`;
	}

	const odyseeUrl = `https://odysee.com/${lbry.normalized_name}:${lbry.claim_id.slice(0, 1)}`;

	return new PlatformChannel({
		id: new PlatformID(PLATFORM, lbry.claim_id, plugin.config.id, PLATFORM_CLAIMTYPE),
		name: getChannelNameFromChannelClaim(lbry),
		thumbnail: lbry.value?.thumbnail?.url ?? "",
		banner: lbry.value?.cover?.url,
		subscribers: subs,
		description,
		url: lbry.permanent_url,
		urlAlternatives: [
			lbry.canonical_url,
			odyseeUrl
		],
		links: {}
	});
}

//Convert a LBRY Video (claim) to a PlatformVideo
function lbryVideoToPlatformVideo(lbry, viewCountMap = null) {
	const shareUrl = lbry.signing_channel?.claim_id !== undefined
		? format_odysee_share_url(lbry.signing_channel.name, lbry.signing_channel.claim_id, lbry.name, lbry.claim_id)
		: format_odysee_share_url_anonymous(lbry.name, lbry.claim_id.slice(0, 1))

	let viewCount = 0;
	
	// Use batch view count if provided, otherwise fall back to individual request
	if (viewCountMap && viewCountMap.has(lbry.claim_id)) {
		viewCount = viewCountMap.get(lbry.claim_id);
	} else if (localSettings.extraRequestToLoadViewCount && viewCountMap === null) {
		const metrics = lbryToMetrics(lbry, { loadViewCount: true });
		viewCount = metrics.viewCount;
	}

	return new PlatformVideo({
		id: new PlatformID(PLATFORM, lbry.claim_id, plugin.config.id),
		name: lbry.value?.title ?? "",
		thumbnails: new Thumbnails([new Thumbnail(lbry.value?.thumbnail?.url, 0)]),
		author: channelToPlatformAuthorLink(lbry),
		datetime: lbryVideoToDateTime(lbry),
		duration: lbryToDuration(lbry),
		viewCount: viewCount,
		url: lbry.permanent_url,
		shareUrl,
		isLive: false,
		links: {}
	});
}

//Batch load view counts for multiple claim IDs
function batchLoadViewCounts(claimIds) {
	if (!claimIds || claimIds.length === 0 || !localSettings.extraRequestToLoadViewCount) {
		return new Map();
	}

	const authToken = localState.auth_token;
	const formHeaders = {
		"Content-Type": "application/x-www-form-urlencoded"
	};

	// Create batch requests for view counts
	const requests = claimIds.map(claimId => ({
		url: URL_VIEW_COUNT,
		headers: formHeaders,
		body: `auth_token=${authToken}&claim_id=${claimId}`
	}));

	const responses = batchRequest(requests, { useStateCache: true });
	const viewCountMap = new Map();

	// Process responses
	responses.forEach((response, index) => {
		const claimId = claimIds[index];
		if (response?.isOk) {
			try {
				const viewCountObj = JSON.parse(response.body);
				if (viewCountObj?.success && viewCountObj?.data) {
					viewCountMap.set(claimId, viewCountObj.data[0] ?? 0);
				}
			} catch (error) {
				console.error(`Error parsing view count for ${claimId}:`, error);
			}
		}
	});

	return viewCountMap;
}

//Convert array of LBRY Videos to PlatformVideos with batched view count loading
function lbryVideosToPlatformVideos(lbryVideos) {
	if (!lbryVideos || lbryVideos.length === 0) {
		return [];
	}

	let viewCountMap = null;
	if (localSettings.extraRequestToLoadViewCount) {
		const claimIds = lbryVideos.map(lbry => lbry.claim_id);
		viewCountMap = batchLoadViewCounts(claimIds);
	}

	return lbryVideos.map(lbry => lbryVideoToPlatformVideo(lbry, viewCountMap));
}

function lbryDocumentToPlatformPost(lbry, postContent) {
	const shareUrl = lbry.signing_channel?.claim_id !== undefined
		? format_odysee_share_url(lbry.signing_channel.name, lbry.signing_channel.claim_id, lbry.name, lbry.claim_id)
		: format_odysee_share_url_anonymous(lbry.name, lbry.claim_id.slice(0, 1));

	const sdHash = lbry.value?.source?.sd_hash;
	const sdHashPrefix = sdHash.substring(0, 6);

	if (!postContent) {
		// Odysee get the markdown content like this...
		const res = http.GET(`https://player.odycdn.com/v6/streams/${lbry.claim_id}/${sdHashPrefix}.mp4`, headersToAdd);
		if (res.isOk) {
			postContent = res.body;
		}
	}

	let content;
	const mediaType = lbry?.value?.source?.media_type;

	let images = [];

	switch (mediaType) {
		case 'text/markdown':
			content = markdownToHtml(postContent);
			images = extractImagesFromMarkdown(postContent);
			break;
		case 'text/plain':
			content = postContent;
			break;
		case 'text/html':
			content = postContent; // Already HTML
			images = extractImagesFromMarkdown(postContent);
			break;
		default:
			console.log(`Unhandled media type: ${mediaType}, treating as plain text`);
			content = postContent;
			break;
	}

	const {
		rating,
		subCount
	} = lbryToMetrics(lbry, { loadSubCount: true, loadRating: true });

	const platformPostDef = {
		id: new PlatformID(PLATFORM, lbry.claim_id, plugin.config.id),
		name: lbry.value?.title ?? "",
		author: channelToPlatformAuthorLink(lbry, subCount),
		datetime: lbryVideoToDateTime(lbry),
		url: shareUrl,
		rating: rating,
		textType: Type.Text.HTML,
		content: content,
		thumbnails: []
	};

	if (!images.length && lbry.value?.thumbnail?.url) {
		images.push(lbry.value?.thumbnail?.url);
	}

	images.forEach((imageUrl, idx) => {
		platformPostDef.thumbnails.push(new Thumbnails([new Thumbnail(imageUrl, idx)]));
	})

	platformPostDef.images = images;

	return new PlatformPostDetails(platformPostDef);
}

function format_odysee_share_url_anonymous(video_name, video_claim_id) {
	return `${URL_BASE}/${video_name}:${video_claim_id.slice(0, 1)}`
}
function format_odysee_share_url(channel_name, channel_claim_id, video_name, video_claim_id) {
	return `${URL_BASE}/${channel_name}:${channel_claim_id.slice(0, 1)}/${video_name}:${video_claim_id.slice(0, 1)}`
}
//Convert an LBRY Video to a PlatformVideoDetail
function lbryVideoDetailToPlatformVideoDetails(lbry) {

	const sdHash = lbry.value?.source?.sd_hash;
	const claimId = lbry.claim_id;
	const videoHeight = lbry.value?.video?.height ?? 0;
	const videoWidth = lbry.value?.video?.width ?? 0;
	const streamType = lbry.value?.stream_type;
	const mediaType = lbry.value?.source?.media_type;
	const name = lbry.name;
	let video = null;

	// Helper function to get video duration
	const getVideoDuration = () => lbryToDuration(lbry);

	if (!sdHash) {
		// Handle case with no sdHash
		if (streamType === 'video') {
			// Legacy URL format without sdHash
			video = new VideoSourceDescriptor([
				new VideoUrlSource({
					name: `Original ${videoHeight}P`,
					url: `https://cdn.lbryplayer.xyz/content/claims/${name}/${claimId}/stream`,
					width: videoWidth,
					height: videoHeight,
					duration: getVideoDuration(),
					container: mediaType ?? "",
					requestModifier: { headers: headersToAdd }
				})
			]);
		} else if (lbry.value?.video === undefined) {
			throw new UnavailableException("Odysee live streams are not currently supported");
		}
	} else {
		// With sdHash present, handle both audio and video
		if (streamType === 'audio') {
			const audioUrl = `https://player.odycdn.com/v6/streams/${claimId}/${sdHash}.mp4`;
			const sources = [
				new AudioUrlSource({
					name: mediaType,
					url: audioUrl,
					container: mediaType,
					duration: getVideoDuration(),
					requestModifier: { headers: headersToAdd }
				})
			];
			video = new UnMuxVideoSourceDescriptor([], sources);
		}
		else if (streamType === 'video') {
			const sources = [];
			const sdHashPrefix = sdHash.substring(0, 6);

			// Try HLS v6 first
			const hlsUrlV6 = `https://player.odycdn.com/v6/streams/${claimId}/${sdHash}/master.m3u8`;
			const hlsResponseV6 = http.GET(hlsUrlV6, headersToAdd);
			
			if(getIsMemberOnlyClaim(lbry)) {
				sources.push(new VideoUrlSource({
					name: mediaType ?? "video/mp4",
					url: getStreamingSourceUrl(lbry),
					width: videoWidth,
					height: videoHeight,
					duration: getVideoDuration(),
					container: mediaType ?? "video/mp4",
					requestModifier: { headers: headersToAdd }
				}));
			}
			else if (hlsResponseV6.isOk && hlsResponseV6.body) {
				sources.push(new HLSSource({
					name: "HLS (v6)",
					url: hlsUrlV6,
					duration: getVideoDuration(),
					priority: true,
					requestModifier: { headers: headersToAdd }
				}));
			} else {
				// Fallback to HLS v4
				const hlsUrlV4 = `https://player.odycdn.com/api/v4/streams/tc/${name}/${claimId}/${sdHash}/master.m3u8`;
				const hlsResponseV4 = http.GET(hlsUrlV4, headersToAdd);
				if (hlsResponseV4.isOk && hlsResponseV4.body) {
					sources.push(new HLSSource({
						name: "HLS",
						url: hlsUrlV4,
						duration: getVideoDuration(),
						priority: true,
						requestModifier: { headers: headersToAdd }
					}));
				}
			}

			// Try direct mp4 v6 first
			const downloadUrlV6 = `https://player.odycdn.com/v6/streams/${claimId}/${sdHashPrefix}.mp4`;
			const rangeHeaders = { "Range": "bytes=0-10", ...headersToAdd };

			console.log("downloadUrl2", downloadUrlV6);
			const downloadResponseV6 = http.GET(downloadUrlV6, rangeHeaders);

			if (downloadResponseV6.isOk) {
				sources.push(new VideoUrlSource({
					name: `Original ${videoHeight}P (v6)`,
					url: downloadUrlV6,
					width: videoWidth,
					height: videoHeight,
					duration: getVideoDuration(),
					container: downloadResponseV6.headers["content-type"]?.[0] ?? "video/mp4",
					requestModifier: { headers: headersToAdd }
				}));
			} else {
				// Fallback to direct mp4 v4
				const downloadUrlV4 = `https://player.odycdn.com/api/v4/streams/free/${name}/${claimId}/${sdHashPrefix}`;
				const downloadResponseV4 = http.GET(downloadUrlV4, { "Range": "bytes=0-0", ...headersToAdd });

				if (downloadResponseV4.isOk) {
					sources.push(new VideoUrlSource({
						name: `Original ${videoHeight}P (v4)`,
						url: downloadUrlV4,
						width: videoWidth,
						height: videoHeight,
						duration: getVideoDuration(),
						container: downloadResponseV4.headers["content-type"]?.[0] ?? "video/mp4",
						requestModifier: { headers: headersToAdd }
					}));
				}
			}

			if (sources.length === 0) {
				throw new UnavailableException("Members Only Content Is Not Currently Supported");
			}

			video = new VideoSourceDescriptor(sources);
		}
		else if (lbry.value?.video === undefined) {
			throw new UnavailableException("Odysee live streams are not currently supported");
		}
	}

	if (IS_TESTING) {
		console.log(lbry);
	}

	const {
		rating,
		viewCount,
		subCount
	} = lbryToMetrics(lbry, { loadViewCount: true, loadSubCount: true, loadRating: true });


	// Generate share URL
	const shareUrl = lbry?.signing_channel?.claim_id
		? format_odysee_share_url(lbry.signing_channel.name, lbry.signing_channel?.claim_id, name, claimId)
		: format_odysee_share_url_anonymous(name, claimId.slice(0, 1));

	// Return the final video details object
	return new PlatformVideoDetails({
		id: new PlatformID(PLATFORM, claimId, plugin.config.id),
		name: lbry.value?.title ?? "",
		thumbnails: new Thumbnails([new Thumbnail(lbry.value?.thumbnail?.url, 0)]),
		author: channelToPlatformAuthorLink(lbry, subCount),
		datetime: lbryVideoToDateTime(lbry),
		duration: getVideoDuration(),
		viewCount,
		url: lbry.permanent_url,
		shareUrl,
		isLive: false,
		description: lbry.value?.description ?? "",
		rating,
		video
	});
}

const getAuthInfo = function () {

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

function channelToPlatformAuthorLink(lbry, subCount) {
	if (lbry.signing_channel?.claim_id) {
		return new PlatformAuthorLink(
			new PlatformID(PLATFORM, lbry.signing_channel?.claim_id, plugin.config.id, PLATFORM_CLAIMTYPE),
			getChannelNameFromContentClaim(lbry),
			lbry.signing_channel?.permanent_url ?? "",
			lbry.signing_channel?.value?.thumbnail?.url ?? "",
			subCount
		)
	} else {
		return EMPTY_AUTHOR;
	}
}

/**
 * Extracts a channel name from a LBRY channel claim
 * @param {Object} lbry - The LBRY channel claim
 * @returns {string} - The formatted channel name
 */
function getChannelNameFromChannelClaim(lbry) {
	
	if (lbry.value?.title) {
	  return lbry.value?.title;
	}

	if (lbry?.name) {
	  return lbry.name;
	}
	
	return '';
}

/**
 * Extracts a channel name from a LBRY content
 * @param {Object} lbry - The LBRY object containing channel information
 * @returns {string} - The formatted channel name
 */
function getChannelNameFromContentClaim(lbry) {
	if (lbry.signing_channel?.value?.title) {
	  return lbry.signing_channel.value.title;
	}
	
	if (lbry.signing_channel?.name) {
	  return lbry.signing_channel.name;
	}
	
	return '';
}

function lbryVideoToDateTime(lbry) {
	return parseInt(lbry?.value?.release_time ?? lbry?.timestamp ?? 0)
}

function lbryToDuration(lbry){
	return lbry.value?.video?.duration ?? lbry.value?.audio?.duration ?? 0;
}

function lbryToMetrics(lbry, opts = { loadViewCount: false, loadSubCount: false, loadRating: false }) {

	const claimId = lbry.claim_id;

	let rating = null;
	let viewCount = 0;
	let subCount = 0;

	const formHeaders = {
		"Content-Type": "application/x-www-form-urlencoded"
	};

	const authToken = localState.auth_token;

	const requests = [
		{
			url: URL_REACTIONS,
			headers: formHeaders,
			body: `auth_token=${authToken}&claim_ids=${claimId}`
		},
		{
			url: URL_API_SUB_COUNT,
			headers: formHeaders,
			body: lbry.signing_channel?.claim_id ? `auth_token=${authToken}&claim_id=${lbry.signing_channel?.claim_id}` : ''
		}
	]

	if(opts.loadViewCount) {
		requests.push({
			url: URL_VIEW_COUNT,
			headers: formHeaders,
			body:  `auth_token=${authToken}&claim_id=${claimId}`
		})
	}

	const [reactionResp, subCountResp, viewCountResp] = batchRequest(requests, { useStateCache: true });

	// Process reaction response
	if (opts.loadRating && reactionResp?.isOk) {
		const reactionObj = JSON.parse(reactionResp.body);
		const reactionsData = reactionObj?.data?.others_reactions?.[claimId];

		if (reactionObj?.success && reactionsData) {
			rating = new RatingLikesDislikes(reactionsData.like ?? 0, reactionsData.dislike ?? 0);
		}
	}

	// Process view count response
	if (opts.loadViewCount && viewCountResp?.isOk) {
		const viewCountObj = JSON.parse(viewCountResp.body);
		if (viewCountObj?.success && viewCountObj?.data) {
			viewCount = viewCountObj.data[0] ?? 0;
		}
	}

	// Process subscriber count response
	if (opts.loadSubCount && subCountResp?.isOk) {
		const subCountObj = JSON.parse(subCountResp.body);
		if (subCountObj?.success && subCountObj?.data) {
			subCount = subCountObj.data[0] ?? 0;
		}
	}

	return {
		rating, viewCount, subCount
	}
}

function objectToUrlEncodedString(obj) {
	const encodedParams = [];

	for (const key in obj) {
		if (obj.hasOwnProperty(key)) {
			const encodedKey = encodeURIComponent(key);
			const encodedValue = encodeURIComponent(obj[key]);
			encodedParams.push(`${encodedKey}=${encodedValue}`);
		}
	}

	return encodedParams.join('&');
}

/**
 * Converts Markdown text to HTML
 * @param {string} markdown - The markdown text to convert
 * @returns {string} The converted HTML
 */
function markdownToHtml(markdown) {
	if (!markdown) return '';

	// Preprocessing - normalize line endings
	let html = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

	// First, escape all HTML to prevent injection attacks
	html = escapeHtml(html);

	// Process code blocks (need to handle these first)
	html = html.replace(/```([a-z]*)\n([\s\S]*?)\n```/g, function(match, language, code) {
		return `<pre><code class="language-${language}">${code}</code></pre>`;
	});

	// Process inline code (already escaped)
	html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

	// Process headings (# Heading, ## Heading, etc)
	html = html.replace(/^(#{1,6})\s+(.*?)$/gm, function(match, hashes, content) {
		const level = hashes.length;
		return `<h${level}>${content.trim()}</h${level}>`;
	});

	// Process bold (** or __)
	html = html.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>');

	// Process italic (* or _)
	html = html.replace(/(\*|_)(.*?)\1/g, '<em>$2</em>');

	// Process links [text](url) - with URL validation
	html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(match, text, url) {
		// Validate and sanitize URLs
		if (isValidUrl(url)) {
			return `<a href="${sanitizeUrl(url)}" rel="noopener noreferrer">${text}</a>`;
		} else {
			return text; // If URL is invalid, just show the text
		}
	});

	// Process images ![alt](url) - with URL validation
	html = html.replace(/!\[([^\]]+)\]\(([^)]+)\)/g, function(match, alt, url) {
		if (isValidUrl(url)) {
			return `<img src="${sanitizeUrl(url)}" alt="${alt}" loading="lazy">`;
		} else {
			return `[Image: ${alt}]`; // Fallback for invalid URLs
		}
	});

	// Process horizontal rules
	html = html.replace(/^([-*_])\1\1+$/gm, '<hr>');

	// Process unordered lists
	let inList = false;
	let listHtml = '';

	html = html.split('\n').map(line => {
		const listMatch = line.match(/^[\*\-\+]\s+(.*)$/);
		if (listMatch) {
			if (!inList) {
				inList = true;
				listHtml = '<ul>';
			}
			listHtml += `<li>${listMatch[1]}</li>`;
			return null; // Mark for removal
		} else if (inList && line.trim() === '') {
			inList = false;
			const result = listHtml + '</ul>';
			listHtml = '';
			return result;
		} else if (inList) {
			inList = false;
			const result = listHtml + '</ul>';
			listHtml = '';
			return result + '\n' + line;
		}
		return line;
	}).filter(line => line !== null).join('\n');

	// Clean up any remaining list
	if (inList) {
		html += listHtml + '</ul>';
	}

	// Process ordered lists (similar approach to unordered lists)
	inList = false;
	listHtml = '';

	html = html.split('\n').map(line => {
		const listMatch = line.match(/^\d+\.\s+(.*)$/);
		if (listMatch) {
			if (!inList) {
				inList = true;
				listHtml = '<ol>';
			}
			listHtml += `<li>${listMatch[1]}</li>`;
			return null; // Mark for removal
		} else if (inList && line.trim() === '') {
			inList = false;
			const result = listHtml + '</ol>';
			listHtml = '';
			return result;
		} else if (inList) {
			inList = false;
			const result = listHtml + '</ol>';
			listHtml = '';
			return result + '\n' + line;
		}
		return line;
	}).filter(line => line !== null).join('\n');

	// Clean up any remaining list
	if (inList) {
		html += listHtml + '</ol>';
	}

	// Process blockquotes
	html = html.replace(/^>\s+(.*)$/gm, '<blockquote>$1</blockquote>');

	// Process paragraphs (any text between blank lines that isn't a special element)
	let inParagraph = false;
	let paragraphContent = '';

	html = html.split('\n').map(line => {
		if (line.trim() === '') {
			if (inParagraph) {
				inParagraph = false;
				const result = `<p>${paragraphContent}</p>`;
				paragraphContent = '';
				return result;
			}
			return '';
		} else if (line.startsWith('<') && !inParagraph) {
			// Skip lines that already have HTML tags
			return line;
		} else {
			if (!inParagraph) {
				inParagraph = true;
				paragraphContent = line;
			} else {
				paragraphContent += ' ' + line;
			}
			return null; // Mark for removal
		}
	}).filter(line => line !== null).join('\n');

	// Clean up any remaining paragraph
	if (inParagraph) {
		html += `<p>${paragraphContent}</p>`;
	}

	// Process automatic links (bare URLs) with validation
	html = html.replace(/(?<!["\(])(https?:\/\/[^\s<]+)(?!["\)])/g, function(match, url) {
		if (isValidUrl(url)) {
			return `<a href="${sanitizeUrl(url)}" rel="noopener noreferrer">${url}</a>`;
		} else {
			return url; // If URL is invalid, just show the text
		}
	});

	return html;
}

/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param {string} text - The text to escape
 * @returns {string} The escaped text
 */
function escapeHtml(text) {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

/**
 * Validates a URL to ensure it uses an acceptable protocol
 * @param {string} url - The URL to validate
 * @returns {boolean} Whether the URL is valid
 */
function isValidUrl(url) {
	// Basic URL validation
	try {
		const parsedUrl = new URL(url);
		// Only allow http, https protocols (no javascript:, data:, etc.)
		return ['http:', 'https:','lbry:'].includes(parsedUrl.protocol);
	} catch (e) {
		// If URL is malformed, consider it invalid
		return false;
	}
}

/**
 * Sanitizes a URL to prevent XSS attacks
 * @param {string} url - The URL to sanitize
 * @returns {string} The sanitized URL
 */
function sanitizeUrl(url) {
	// Ensure URL is a string
	url = String(url);

	try {
		// Parse the URL to get components
		const parsedUrl = new URL(url);

		// Check for potentially dangerous protocols
		if (!['http:', 'https:','lbry:'].includes(parsedUrl.protocol)) {
			return '#'; // Return harmless link
		}

		// Return the original URL if it passed our checks
		return url;
	} catch (e) {
		// If URL parsing fails, return a harmless link
		return '#';
	}
}

function loadOptionsForSetting(settingKey) {
	return localConfig?.settings?.find((s) => s.variable == settingKey)
		?.options ?? [];
}


/**
 * Executes multiple HTTP requests in a batch with optional caching
 * @param {Array} requests - Array of request objects
 * @param {Object} opts - Options object
 * @param {boolean} [opts.useStateCache=false] - Whether to use state caching
 * @returns {Array} - Array of responses corresponding to the requests
 */
function batchRequest(requests, opts = {}) {
	// Default to using cache if not specified
	const useStateCache = opts.useStateCache !== undefined ? opts.useStateCache : false;

	// Initialize cache if it doesn't exist
	if (!localState.batch_response_cache) {
		localState.batch_response_cache = {};
	}

	let batch = http.batch();
	let cacheHits = {};
	let batchRequestIndices = [];
	let batchRequestCount = 0;

	// First pass: identify cache hits and prepare batch for non-cached requests
	for (let i = 0; i < requests.length; i++) {
		const request = requests[i];

		// Validate request
		if (!request.url) {
			throw new ScriptException('An HTTP request must have a URL');
		}

		// Determine method and create request key
		const hasBody = !!request.body;
		const method = request.method || (hasBody ? 'POST' : 'GET');
		const requestKey = hasBody ?
			`${method}${request.url}${JSON.stringify(request.body)}` :
			`${method}${request.url}`;

		// Store the request key for later use
		request.requestKey = requestKey;

		// Check cache if caching is enabled
		if (useStateCache && localState.batch_response_cache[requestKey]) {
			cacheHits[i] = localState.batch_response_cache[requestKey];
		} else {
			// Add to batch if not in cache or caching is disabled
			if (!hasBody) {
				batch = batch.request(
					method,
					request.url,
					request.headers || {},
					request.auth || false
				);
			} else {
				batch = batch.requestWithBody(
					method,
					request.url,
					request.body,
					request.headers || {},
					request.auth || false
				);
			}
			// Map the original request index to the batch index
			batchRequestIndices[batchRequestCount] = i;
			batchRequestCount++;
		}
	}

	// Execute batch request only if there are non-cached requests
	let batchResponses = [];
	if (batchRequestCount > 0) {
		try {
			batchResponses = batch.execute();
		} catch (error) {
			throw new ScriptException(`Batch execution failed: ${error.message}`);
		}
	}

	// Prepare final response array
	const finalResponses = new Array(requests.length);

	// Add cache hits to final responses
	for (const [index, response] of Object.entries(cacheHits)) {
		finalResponses[parseInt(index)] = response;
	}

	// Add batch responses to final responses and update cache
	for (let i = 0; i < batchResponses.length; i++) {
		const originalIndex = batchRequestIndices[i];
		const response = batchResponses[i];
		finalResponses[originalIndex] = response;

		// Update cache with new responses if caching is enabled
		if (useStateCache) {
			const requestKey = requests[originalIndex].requestKey;
			localState.batch_response_cache[requestKey] = response;
		}
	}

	return finalResponses;
}

function createMultiSourcePager(sourcesConfig = []) {
    class MultiSourceVideoPager extends VideoPager {
        constructor({
            videos = [],
            hasMore = true,
            contexts = {},
            currentSources = new Set()
        } = {}) {
            super(videos, hasMore, { page: 0 });
            this.contexts = contexts;
            this.currentSources = currentSources;
        }
        
        addSource(sourceConfig) {
            // Create a unique identifier for this source based on the request parameters
            const streamTypes = sourceConfig.request_body.stream_types || ["all"];
            const sourceId = `source_${streamTypes.join('_')}_${Date.now() + Math.random()}`;

            if (!this.contexts[sourceId]) {
                // Initialize context for this source if it doesn't exist
                this.contexts[sourceId] = {
                    page: 1, // Start with page 1 for LBRY API
                    page_size: sourceConfig.request_body.page_size || 20,
                    config: sourceConfig,
                    hasMore: true,
                    feedType: sourceConfig.feedType // Store the feed type for filtering
                };
                this.currentSources.add(sourceId);
            }
        }
        
        nextPage() {
            // Clone states to avoid mutation
            const newContexts = {};
            const newCurrentSources = new Set(this.currentSources);
            for (const sourceId of this.currentSources) {
                newContexts[sourceId] = { ...this.contexts[sourceId] };
            }
            
            const batch = http.batch();
            const sourcesToFetch = [];
            
            // Prepare batch requests for sources that have more content
            for (const sourceId of newCurrentSources) {
                const context = newContexts[sourceId];
                if (!context.hasMore) continue;
                
                const { config } = context;
                
                // Create a new request body with updated pagination
                const updatedRequestBody = {
                    ...config.request_body,
                    page: context.page,
                    page_size: context.page_size
                };
                
                const body = JSON.stringify({
                    jsonrpc: "2.0",
                    method: "claim_search",
                    params: updatedRequestBody,
                    id: Date.now() + Math.floor(Math.random() * 1000) // Unique ID for each request
                });
                
                // Add to batch
                batch.POST(URL_CLAIM_SEARCH, body, { "Content-Type": "application/json" });
                sourcesToFetch.push({ 
                    sourceId, 
                    context, 
                    updatedRequestBody,
                    feedType: context.feedType // Include feed type for filtering
                });
            }
            
            // Execute batch requests if there are any
            let responses = [];
            if (sourcesToFetch.length > 0) {
                responses = batch.execute();
                if (responses.length !== sourcesToFetch.length) {
                    throw new ScriptException("Batch response count mismatch");
                }
            }
            
            // Process responses and collect videos
            const allNewVideos = [];
            let hasMoreOverall = false;
            for (let i = 0; i < sourcesToFetch.length; i++) {
                const { sourceId, context, updatedRequestBody, feedType } = sourcesToFetch[i];
                const res = responses[i];
                
                if (!res.isOk) {
                    log(`Request failed for source ${sourceId}: ${res.code} - ${res.body}`);
                    context.hasMore = false; // Stop trying this source
                    continue;
                }
                
                try {
                    const responseBody = JSON.parse(res.body);
                    
                    // Check for errors in the response
                    if (responseBody.error) {
                        log(`API error for source ${sourceId}: ${JSON.stringify(responseBody.error)}`);
                        context.hasMore = false;
                        continue;
                    }
                    
                    if (!responseBody.result || !responseBody.result.items) {
                        log(`Unexpected response format for source ${sourceId}`);
                        context.hasMore = false;
                        continue;
                    }
                    
                    // Get items from the response
                    const items = responseBody.result.items;
                    
                    if (items.length === 0) {
                        // No more items for this source
                        context.hasMore = false;
                        continue;
                    }
                    
                    // Apply client-side filtering based on feed type
                    let filteredItems = items;
                    const shortContentThreshold = parseInt(shortContentThresholdOptions[localSettings.shortContentThresholdIndex] || 60);
                    
                    if (feedType === Type.Feed.Videos) {
                        // For Videos feed, filter out short videos but keep audios and documents
                        filteredItems = items.filter(item => {
                            // If it's not a video, keep it (audio, document, etc.)
                            if (item.value?.stream_type !== "video") {
                                return true;
                            }
                            
                            // For videos, only keep ones longer than the threshold
                            const duration = item.value?.video?.duration || 0;
                            return duration > shortContentThreshold;
                        });
                    }
                    
                    // Process items into platform content
                    const processedContent = claimSearchItemsToPlatformContent(filteredItems);
                    
                    // Log information about the items for debugging
                    if (processedContent.length === 0 && filteredItems.length > 0) {
                        log(`Warning: No content processed from ${filteredItems.length} items for source ${sourceId}`);
                        log(`Stream types in response: ${filteredItems.map(item => item.value?.stream_type).join(', ')}`);
                    }
                    
                    allNewVideos.push(...processedContent);
                    
                    // Determine if this source has more pages
                    const totalPages = responseBody.result.total_pages || 1;
                    const currentPage = updatedRequestBody.page;
                    const hasMoreForSource = currentPage < totalPages && items.length > 0;
                    
                    // Update context for next pagination
                    context.page++;
                    context.hasMore = hasMoreForSource;
                    hasMoreOverall = hasMoreOverall || hasMoreForSource;
                    
                } catch (error) {
                    log(`Error processing response for source ${sourceId}: ${error.message}`);
                    context.hasMore = false; // Stop trying this source on error
                }
            }
            
            // Sort videos by datetime (newest first) if they have datetime
            if (allNewVideos.length > 0 && allNewVideos[0].datetime) {
                allNewVideos.sort((a, b) => b.datetime - a.datetime);
            }
            
            // If no sources have more content, mark as complete
            if (!hasMoreOverall) {
                return new MultiSourceVideoPager({
                    videos: allNewVideos,
                    hasMore: false,
                    contexts: newContexts,
                    currentSources: newCurrentSources
                });
            }
            
            // Return a new pager with the updated state
            return new MultiSourceVideoPager({
                videos: allNewVideos,
                hasMore: hasMoreOverall,
                contexts: newContexts,
                currentSources: newCurrentSources
            });
        }
    }
    
    // Initialize pager and add sources
    const pager = new MultiSourceVideoPager();
    sourcesConfig.forEach(config => pager.addSource(config));
    return pager;
}

function getIsMemberOnlyClaim(lbry) {
	return lbry?.value?.tags?.includes("c:members-only") ?? false;
}

function getStreamingSourceUrl(lbry) {

	const request = JSON.stringify({ 
		"jsonrpc": "2.0", 
		"method": "get", 
		"params": { 
			"uri": lbry.short_url, 
			"environment": "live" 
		}
	});

	const is_member_only_claim = getIsMemberOnlyClaim(lbry);
	const is_logged_in = bridge.isLoggedIn();

	if(is_member_only_claim && !is_logged_in) {
		throw new LoginRequiredException("This content is for members only. Please log in with an account that has an active membership to this channel to view this content.")
	}

	const use_auth = is_member_only_claim && is_logged_in;

	const contentResponse = http.POST(URL_GET, request, {
		"Content-Type": "application/json"
	}, use_auth);

	if(contentResponse.isOk) {
		const body = JSON.parse(contentResponse.body);

		if(!body.error) {
			return body?.result?.streaming_url;
		}
	}
}

function stringToHex(str) {
	let hex = '';
	
	for (let i = 0; i < str.length; i++) {
	  // Get character code and convert to hexadecimal
	  const charCode = str.charCodeAt(i);
	  const hexValue = charCode.toString(16);
	  
	  // Ensure each byte is represented by at least two characters
	  hex += hexValue.padStart(2, '0');
	}
	
	return hex;
}

function channelSign(channel_id, channel_name) {
	const channelSignRequestBody = JSON.stringify({
		"jsonrpc": "2.0",
		"method": "channel_sign",
		"params": {
			"channel_id": channel_id,
			"hexdata": stringToHex(channel_name)
		}
	})
	
	const res = http.POST(URL_CHANNEL_SIGN, channelSignRequestBody, headersToAdd, true);
	
	if(res.isOk) {
		const body = JSON.parse(res.body);
		return body.result;
	}
}

/**
 * Extracts image URLs from markdown text
 * @param {string} markdown - The markdown text to parse
 * @returns {string[]} - Array of extracted image URLs
 */
function extractImagesFromMarkdown(content) {
    if (!content) return [];
    
    // Regular expression to match markdown image syntax
    const markdownImageRegex = /!\[.*?\]\((.*?)\)/g;
    
    // Regular expression to match HTML img tags
    const htmlImageRegex = /<img[^>]+src="([^">]+)"/g;
    
    const markdownMatches = [];
    const htmlMatches = [];
    
    // Extract markdown images
    let match;
    while ((match = markdownImageRegex.exec(content)) !== null) {
        markdownMatches.push(match[1]);
    }
    
    // Extract HTML images
    while ((match = htmlImageRegex.exec(content)) !== null) {
        htmlMatches.push(match[1]);
    }
    
    // Combine and deduplicate image URLs
    return [...new Set([...markdownMatches, ...htmlMatches])];
}

function passthrough_log(value) {
    log(value);
    return value;
}

function getLineBreakCharacter() {
	// workaround for desktop since currently it does not support new line characters or html breaks/formatting in channel description
    return IS_ANDROID ? "\n\n" : " | ";
}

const LANGUAGE_CODES = {
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "ru": "Russian",
    "ja": "Japanese",
    "ko": "Korean",
    "zh": "Chinese",
    "ar": "Arabic",
    "hi": "Hindi",
    "bn": "Bengali",
    "ur": "Urdu",
    "tr": "Turkish",
    "fa": "Persian",
    "vi": "Vietnamese",
    "id": "Indonesian",
    "th": "Thai",
    "pl": "Polish",
    "nl": "Dutch",
    "sv": "Swedish",
    "da": "Danish",
    "fi": "Finnish",
    "el": "Greek",
    "hu": "Hungarian",
    "ro": "Romanian",
    "cs": "Czech",
    "sk": "Slovak",
    "no": "Norwegian",
    "nb": "Norwegian Bokmål",
    "nn": "Norwegian Nynorsk",
    "hr": "Croatian",
    "lt": "Lithuanian",
    "lv": "Latvian",
    "et": "Estonian",
    "sl": "Slovenian",
    "bg": "Bulgarian",
    "mk": "Macedonian",
    "sr": "Serbian",
    "uk": "Ukrainian",
    "he": "Hebrew",
    "ka": "Georgian",
    "hy": "Armenian",
    "az": "Azerbaijani",
    "kk": "Kazakh",
    "uz": "Uzbek",
    "tg": "Tajik",
    "mn": "Mongolian",
    "gl": "Galician",
    "ca": "Catalan",
    "eu": "Basque",
    "ga": "Irish",
    "is": "Icelandic",
    "mt": "Maltese",
    "cy": "Welsh",
    "gd": "Scottish Gaelic",
    "fo": "Faroese",
    "yi": "Yiddish",
    "lb": "Luxembourgish",
    "jv": "Javanese",
    "su": "Sundanese",
    "ay": "Aymara",
    "gn": "Guarani",
    "to": "Tongan",
    "sm": "Samoan",
    "st": "Sotho",
    "ts": "Tsonga",
    "ve": "Venda",
    "xh": "Xhosa",
    "zu": "Zulu",
    "tn": "Tswana",
    "ss": "Swati",
    "nr": "Ndebele",
    "ny": "Chewa",
    "mg": "Malagasy",
    "ml": "Malayalam",
    "ta": "Tamil",
    "te": "Telugu",
    "kn": "Kannada",
    "mr": "Marathi",
    "pa": "Punjabi",
    "gu": "Gujarati",
    "or": "Odia",
    "as": "Assamese",
    "ne": "Nepali",
    "si": "Sinhala",
    "ku": "Kurdish",
    "ps": "Pashto",
    "sd": "Sindhi",
    "km": "Khmer",
    "ms": "Malay",
    "ha": "Hausa",
    "am": "Amharic",
    "yo": "Yoruba",
    "ig": "Igbo",
    "sw": "Swahili",
    "af": "Afrikaans",
    "be": "Belarusian",
    "la": "Latin",
    "eo": "Esperanto",
    "aa": "Afar",
    "ab": "Abkhazian",
    "ae": "Avestan",
    "ak": "Akan",
    "an": "Aragonese",
    "av": "Avaric",
    "ba": "Bashkir",
    "bh": "Bihari",
    "bi": "Bislama",
    "bm": "Bambara",
    "bo": "Tibetan",
    "br": "Breton",
    "bs": "Bosnian",
    "ce": "Chechen",
    "ch": "Chamorro",
    "co": "Corsican",
    "cr": "Cree",
    "cu": "Church Slavic",
    "cv": "Chuvash",
    "dv": "Maldivian",
    "dz": "Dzongkha",
    "ee": "Ewe",
    "ff": "Fulah",
    "fj": "Fijian",
    "fy": "Western Frisian",
    "gv": "Manx",
    "ho": "Hiri Motu",
    "ht": "Haitian Creole",
    "hz": "Herero",
    "ia": "Interlingua",
    "ie": "Interlingue",
    "ii": "Sichuan Yi",
    "ik": "Inupiaq",
    "io": "Ido",
    "iu": "Inuktitut",
    "kg": "Kongo",
    "ki": "Kikuyu",
    "kj": "Kuanyama",
    "kl": "Kalaallisut",
    "kr": "Kanuri",
    "ks": "Kashmiri",
    "kv": "Komi",
    "kw": "Cornish",
    "ky": "Kyrgyz",
    "lg": "Ganda",
    "li": "Limburgan",
    "ln": "Lingala",
    "lo": "Lao",
    "lu": "Luba-Katanga",
    "mh": "Marshallese",
    "mi": "Maori",
    "my": "Burmese",
    "na": "Nauru",
    "nd": "North Ndebele",
    "ng": "Ndonga",
    "nv": "Navajo",
    "oc": "Occitan",
    "oj": "Ojibwa",
    "om": "Oromo",
    "os": "Ossetic",
    "pi": "Pali",
    "qu": "Quechua",
    "rm": "Romansh",
    "rn": "Rundi",
    "rw": "Kinyarwanda",
    "sa": "Sanskrit",
    "sc": "Sardinian",
    "se": "Northern Sami",
    "sg": "Sango",
    "sn": "Shona",
    "so": "Somali",
    "sq": "Albanian",
    "ti": "Tigrinya",
    "tk": "Turkmen",
    "tl": "Tagalog",
    "tt": "Tatar",
    "tw": "Twi",
    "ty": "Tahitian",
    "ug": "Uighur",
    "vo": "Volapük",
    "wa": "Walloon",
    "wo": "Wolof",
    "za": "Zhuang"
};


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