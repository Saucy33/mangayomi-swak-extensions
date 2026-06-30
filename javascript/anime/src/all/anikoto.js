const mangayomiSources = [
  {
    "name": "Anikoto",
    "id": 206730385,
    "baseUrl": "https://anikototv.to",
    "lang": "all",
    "typeSource": "single",
    "iconUrl":
      "https://www.google.com/s2/favicons?sz=256&domain=https://anikototv.to/",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": false,
    "hasCloudflare": true,
    "sourceCodeUrl": "",
    "apiUrl": "",
    "version": "1.0.12",
    "isManga": false,
    "itemType": 1,
    "isFullData": false,
    "appMinVerReq": "0.5.0",
    "additionalParams": "",
    "sourceCodeLanguage": 1,
    "notes": "",
    "pkgPath": "anime/src/all/anikoto.js",
  },
];

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.client = new Client();
  }

  getPreference(key) {
    return new SharedPreferences().get(key);
  }

  getHeaders(url) {
    return {
      Referer: "https://anikototv.to",
      Origin: "https://anikototv.to",
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      "x-requested-with": "XMLHttpRequest",
    };
  }

  getBaseUrl() {
    return this.getPreference("anikoto_base_url");
  }

  async request(url, hdr) {
    var res = await this.client.get(url, hdr);
    if (res.statusCode != 200) return null;
    return res.body;
  }

  async aniRequest(slug) {
    var baseUrl = this.getBaseUrl();
    var hdr = this.getHeaders();
    var url = slug.includes(baseUrl) ? slug : baseUrl + slug;
    return await this.request(url, hdr);
  }

  async requestDoc(slug) {
    var res = await this.aniRequest(slug);
    return new Document(res);
  }

  async jsonRequest(slug) {
    var res = await this.aniRequest(slug);
    return JSON.parse(res)["result"];
  }

  async requestJson(slug) {
    var res = await this.jsonRequest(slug);
    return new Document(res);
  }

  async filter({ keyword = "", sort = "default", type = "", status = "", season = "", page = "1" }) {
    var titlePref = this.getPreference("anikoto_title_lang");

    var slug = `/filter?keyword=${keyword}&type=${type}&sort=${sort}&status=${status}&season=${season}&page=${page}`;

    var doc = await this.requestDoc(slug);

    var list = [];
    doc
      .selectFirst("#list-items")
      .select(".item")
      .forEach((item) => {
        var dataId = item.selectFirst(".tip").attr("data-tip");
        var nameSection = item.selectFirst(".d-title");
        var name = titlePref == "e" ? nameSection.text : nameSection.attr("data-jp");
        
        var img = item.selectFirst("img");
        var imageUrl = "";
        if (img) {
            let attrs = ["data-src", "data-lazy-src", "data-original", "data-poster", "src"];
            for (let attr of attrs) {
                let val = img.attr(attr);
                if (val && val.length > 0 && !val.includes("data:image") && !val.includes("transparent") && !val.includes("base64")) {
                    imageUrl = val;
                    break;
                }
            }
            if (!imageUrl) imageUrl = img.attr("src") || "";
        }
        
        // Proxy Injection to bypass hotlink protection
        if (imageUrl.startsWith("http")) {
            imageUrl = "https://wsrv.nl/?url=" + encodeURIComponent(imageUrl);
        } else if (imageUrl.startsWith("//")) {
            imageUrl = "https://wsrv.nl/?url=" + encodeURIComponent("https:" + imageUrl);
        }
        
        var link = item.selectFirst("a").attr("href") + "||" + dataId;
        list.push({
          name,
          link,
          imageUrl,
        });
      });

    var pagination = doc.selectFirst("ul.pagination");
    var hasNextPage = false;
    if (pagination) {
       var lis = pagination.select("li");
       if (lis && lis.length > 0) {
           hasNextPage = !lis.reverse()[0].className.includes("active");
       }
    }
    
    return { list, hasNextPage };
  }

  async getPopular(page) {
    return await this.filter({ sort: "most-viewed", page: page });
  }

  async getLatestUpdates(page) {
    return await this.filter({ sort: "latest-updated", page: page });
  }

  async search(query, page, filters) {
    var sort = "default";
    var type = "";
    var status = "";
    var season = "";

    if (filters && filters.length > 0) {
      for (const filter of filters) {
        if (filter.type === "SelectFilter") {
          const value = filter.values[filter.state].value;
          if (filter.name === "Sort") sort = value;
          if (filter.name === "Type") type = value;
          if (filter.name === "Status") status = value;
          if (filter.name === "Season") season = value;
        }
      }
    }

    return await this.filter({
      keyword: query,
      sort: sort,
      type: type,
      status: status,
      season: season,
      page: page,
    });
  }

  async getDetail(url) {
    function statusCode(status) {
      return (
        {
          "Currently Airing": 0,
          "Finished Airing": 1,
        }[status] ?? 5
      );
    }

    var urlSplit = url.split("||");

    var link = urlSplit[0];
    var dataId = urlSplit[1];

    var doc = await this.requestDoc(link);

    var binfo = doc.selectFirst(".binfo");
    var description = binfo
      .selectFirst(".synopsis")
      .selectFirst(".content").text;
    var genre = [];
    var bmeta = binfo
      .selectFirst(".bmeta")
      .selectFirst(".meta")
      .select("div")
      .reverse();

    bmeta[0].select("a").forEach((a) => {
      genre.push(a.text.trim());
    });

    var statusText = bmeta[1].selectFirst("a").text.trim();
    var status = statusCode(statusText);

    var chapters = [];
    var epBaseUrl = `/ajax/episode/list/${dataId}?vrf=`;
    doc = await this.requestJson(epBaseUrl);
    doc.select("li").forEach((item) => {
      var epTitle = item.attr("title");
      var a = item.selectFirst("a");
      var epNum = a.attr("data-num");
      var episodeTitle = `E${epNum}: ${epTitle}`;
      var episodeId = a.attr("data-ids");

      var scanlator = "";
      var dataSub = parseInt(a.attr("data-sub"));
      var dataDub = parseInt(a.attr("data-dub"));
      scanlator = dataSub ? "SUB, " : scanlator;
      scanlator = dataDub ? scanlator + "DUB" : scanlator;

      var dateUpload = a.attr("data-timestamp") + "000";

      chapters.push({
        name: episodeTitle,
        url: episodeId,
        scanlator,
        dateUpload,
      });
    });

    chapters.reverse();
    return { link, status, description, genre, chapters };
  }

  async getVideoList(url) {
    var audioPref = this.getPreference("anikoto_stream_subdub_type");
    var streams = [];
    var slug = `/ajax/server/list?servers=${url}`;
    var doc = await this.requestJson(slug);

    var tags = doc.select(".type");

    for (var tag of tags) {
      var dubType = tag.attr("data-type").toUpperCase();
      if (!audioPref.includes(dubType)) continue;

      var serverTags = tag.selectFirst("ul").select("li");
      for (var item of serverTags) {
        var serverName = item.text.trim();

        if (serverName.includes("VidCloud")) continue;
        var serverId = item.attr("data-link-id");
        var streamData = await this.serverData(serverId, serverName, dubType);

        if (streamData) streams.push(streamData);
      }
    }

    return streams;
  }

  getFilterList() {
    return [
      {
        type: "SelectFilter",
        name: "Type",
        state: 0,
        values: [
          { value: "", name: "All" },
          { value: "movie", name: "Movie" },
          { value: "tv", name: "TV Series" },
          { value: "ova", name: "OVA" },
          { value: "ona", name: "ONA" },
          { value: "special", name: "Special" },
          { value: "music", name: "Music" }
        ],
      },
      {
        type: "SelectFilter",
        name: "Sort",
        state: 0,
        values: [
          { value: "default", name: "Default" },
          { value: "recently-added", name: "Recently Added" },
          { value: "recently-updated", name: "Recently Updated" },
          { value: "score", name: "Score" },
          { value: "name-az", name: "Name A-Z" },
          { value: "released-date", name: "Release Date" },
          { value: "most-watched", name: "Most Watched" }
        ],
      },
      {
        type: "SelectFilter",
        name: "Status",
        state: 0,
        values: [
          { value: "", name: "All" },
          { value: "completed", name: "Completed" },
          { value: "airing", name: "Airing" },
          { value: "upcoming", name: "Upcoming" }
        ],
      },
      {
        type: "SelectFilter",
        name: "Season",
        state: 0,
        values: [
          { value: "", name: "All" },
          { value: "spring", name: "Spring" },
          { value: "summer", name: "Summer" },
          { value: "fall", name: "Fall" },
          { value: "winter", name: "Winter" }
        ],
      }
    ];
  }

  formatSubtitles(subtitles, dubType) {
    var subs = [];
    subtitles.forEach((sub) => {
      if (!sub.kind.includes("thumbnail")) {
        subs.push({
          file: sub.file,
          label: `${sub.label} - ${dubType}`,
        });
      }
    });

    return subs;
  }

  async serverData(dataId, serverName, dubType) {
    function streamNamer(res) {
      return `${res} - ${dubType} : ${serverName}`;
    }

    var streamLinkData = await this.jsonRequest(`/ajax/server?get=${dataId}`);
    var streamEmbedUrl = streamLinkData["url"];

    var embedHdr = {
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      "Referer": "https://anikototv.to/",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Sec-Fetch-Dest": "iframe",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "cross-site"
    };

    var res = await this.request(streamEmbedUrl, embedHdr);
    if (res == null) return null;

    var doc = new Document(res);
    var playerElem = doc.selectFirst("#megaplay-player");
    if (!playerElem) return null;

    var data_id = playerElem.attr("data-id");
    if (data_id.length < 1) return null;

    var apiHdr = {
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      "Referer": streamEmbedUrl,
      "Origin": "https://megaplay.buzz",
      "Accept": "*/*",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "X-Requested-With": "XMLHttpRequest"
    };

    var megaBuzzUrl = "https://megaplay.buzz/";
    var streamApi = `${megaBuzzUrl}stream/getSourcesNew?id=${data_id}&id=${data_id}`;

    res = await this.request(streamApi, apiHdr);
    if (res == null) return null;

    var streamData = JSON.parse(res);
    var url = streamData.sources.file;
    var subtitles = streamData.tracks;
    subtitles = this.formatSubtitles(subtitles, dubType);

    var videoHdr = {
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      "Referer": "https://megaplay.buzz/",
      "Origin": "https://megaplay.buzz"
    };

    return {
      url: url,
      originalUrl: url,
      quality: streamNamer("Auto"),
      headers: videoHdr,
      subtitles,
    };
  }

  getSourcePreferences() {
    return [
      {
        key: "anikoto_base_url",
        editTextPreference: {
          title: "Override base url",
          summary: "",
          value: "https://anikototv.to",
          dialogTitle: "Override base url",
          dialogMessage: "",
        },
      },
      {
        key: "anikoto_title_lang",
        listPreference: {
          title: "Preferred title language",
          summary: "Choose in which language anime title should be shown",
          valueIndex: 0,
          entries: ["English", "Romaji"],
          entryValues: ["e", "r"],
        },
      },
      {
        key: "anikoto_stream_subdub_type",
        multiSelectListPreference: {
          title: "Preferred stream sub/dub type",
          summary: "",
          values: ["SUB", "HSUB", "DUB"],
          entries: ["Soft Sub", "Hard Sub", "Dub"],
          entryValues: ["SUB", "HSUB", "DUB"],
        },
      },
    ];
  }
}

var extention = new DefaultExtension();
