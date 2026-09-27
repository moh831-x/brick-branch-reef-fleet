<?php
/**
 * Search proxies for the Folio theme.
 */

if (!defined('ABSPATH')) {
    exit;
}

function folio_remote($url)
{
    $response = wp_remote_get($url, array(
        'timeout' => 12,
        'redirection' => 3,
        'headers' => array(
            'User-Agent' => 'Folio/1.0 (personal research reader)',
            'Accept' => 'application/json, application/xml, text/xml, text/html, */*',
        ),
    ));
    if (is_wp_error($response)) {
        return '';
    }
    $code = (int) wp_remote_retrieve_response_code($response);
    if ($code < 200 || $code >= 300) {
        return '';
    }
    return (string) wp_remote_retrieve_body($response);
}

function folio_clip($text, $limit = 220)
{
    $text = trim(preg_replace('/\s+/', ' ', wp_strip_all_tags((string) $text)));
    if (strlen($text) <= $limit) {
        return $text;
    }
    return rtrim(substr($text, 0, $limit - 1)) . '…';
}

function folio_host($url)
{
    $host = wp_parse_url($url, PHP_URL_HOST);
    if (!is_string($host) || $host === '') {
        return '';
    }
    return preg_replace('/^www\./', '', strtolower($host));
}

function folio_safe_url($url)
{
    $url = esc_url_raw((string) $url);
    if ($url === '' || !preg_match('#^https://#i', $url)) {
        return '';
    }
    return $url;
}

function folio_search_web($query, $page)
{
    $first = max(1, (($page - 1) * 8) + 1);
    $rss = folio_remote('https://www.bing.com/search?q=' . rawurlencode($query) . '&format=rss&first=' . $first);
    $html = folio_remote('https://www.bing.com/search?q=' . rawurlencode($query) . '&count=8&first=' . $first);
    $results = array();
    if ($rss && preg_match_all('/<item>([\s\S]*?)<\/item>/i', $rss, $items)) {
        foreach ($items[1] as $block) {
            if (!preg_match('/<title>([\s\S]*?)<\/title>/i', $block, $title)) {
                continue;
            }
            if (!preg_match('/<link>([\s\S]*?)<\/link>/i', $block, $link)) {
                continue;
            }
            $url = folio_safe_url(html_entity_decode(trim($link[1]), ENT_QUOTES, 'UTF-8'));
            $host = folio_host($url);
            if ($url === '' || $host === '' || substr($host, -8) === 'bing.com') {
                continue;
            }
            $snippet = '';
            if (preg_match('/<description>([\s\S]*?)<\/description>/i', $block, $desc)) {
                $snippet = folio_clip(html_entity_decode($desc[1], ENT_QUOTES, 'UTF-8'));
            }
            $when = '';
            if (preg_match('/<pubDate>([\s\S]*?)<\/pubDate>/i', $block, $date) && strtotime($date[1])) {
                $when = gmdate('M j, Y', strtotime($date[1]));
            }
            $results[] = array(
                'id' => 'web:' . md5($url),
                'source' => 'web',
                'title' => folio_clip(html_entity_decode($title[1], ENT_QUOTES, 'UTF-8'), 180),
                'url' => $url,
                'snippet' => $snippet,
                'meta' => trim($host . ($when ? ' · ' . $when : '')),
            );
            if (count($results) >= 8) {
                break;
            }
        }
    }
    $total = null;
    if ($html && preg_match('/class="sb_count"[^>]*>([^<]+)/i', $html, $count)) {
        if (preg_match_all('/\d+/', str_replace(',', '', $count[1]), $nums) && $nums[0]) {
            $total = max(array_map('intval', $nums[0]));
        }
    }
    return array(
        'results' => $results,
        'total' => $total,
        'error' => $rss === '' ? 'unavailable' : '',
        'done' => count($results) < 8,
    );
}

function folio_search_wiki($query, $page)
{
    $offset = max(0, ($page - 1) * 8);
    $url = 'https://en.wikipedia.org/w/api.php?action=query&format=json&list=search'
        . '&srsearch=' . rawurlencode($query)
        . '&srlimit=8&sroffset=' . $offset
        . '&srnamespace=0&srprop=snippet|timestamp&srinfo=totalhits';
    $raw = folio_remote($url);
    $data = $raw ? json_decode($raw, true) : null;
    $results = array();
    $rows = isset($data['query']['search']) && is_array($data['query']['search']) ? $data['query']['search'] : array();
    foreach ($rows as $row) {
        $title = isset($row['title']) ? trim($row['title']) : '';
        if ($title === '') {
            continue;
        }
        $article = 'https://en.wikipedia.org/wiki/' . rawurlencode(str_replace(' ', '_', $title));
        $when = '';
        if (!empty($row['timestamp']) && strtotime($row['timestamp'])) {
            $when = gmdate('M j, Y', strtotime($row['timestamp']));
        }
        $results[] = array(
            'id' => 'wiki:' . md5($title),
            'source' => 'wiki',
            'title' => $title,
            'url' => $article,
            'snippet' => folio_clip(isset($row['snippet']) ? $row['snippet'] : ''),
            'meta' => $when ? $when : 'Wikipedia',
        );
    }
    $total = isset($data['query']['searchinfo']['totalhits']) ? (int) $data['query']['searchinfo']['totalhits'] : null;
    return array(
        'results' => $results,
        'total' => $total,
        'error' => $raw === '' ? 'unavailable' : '',
        'done' => count($results) < 8,
    );
}

function folio_search_grok($query, $page)
{
    $offset = max(0, ($page - 1) * 12);
    $url = 'https://grokipedia.com/api/full-text-search?query=' . rawurlencode($query) . '&limit=12&offset=' . $offset;
    $raw = folio_remote($url);
    $data = $raw ? json_decode($raw, true) : null;
    $results = array();
    $rows = isset($data['results']) && is_array($data['results']) ? $data['results'] : array();
    foreach ($rows as $row) {
        $slug = isset($row['slug']) ? trim($row['slug']) : '';
        $title = isset($row['title']) && trim($row['title']) !== '' ? trim($row['title']) : str_replace('_', ' ', $slug);
        if ($slug === '' || $title === '') {
            continue;
        }
        $results[] = array(
            'id' => 'grok:' . $slug,
            'source' => 'grok',
            'title' => $title,
            'url' => 'https://grokipedia.com/page/' . rawurlencode($slug),
            'snippet' => folio_clip(isset($row['snippet']) ? $row['snippet'] : ''),
            'meta' => 'grokipedia.com',
        );
    }
    $total = isset($data['totalCount']) ? (int) $data['totalCount'] : null;
    return array(
        'results' => $results,
        'total' => $total,
        'error' => $raw === '' ? 'unavailable' : '',
        'done' => count($results) < 12,
    );
}

function folio_define($query)
{
    $phrase = trim($query);
    if ($phrase === '' || preg_match('/[^\p{L}\s\'-]/u', $phrase)) {
        return array();
    }
    $words = preg_split('/\s+/', $phrase);
    if (!$words || count($words) > 4) {
        return array();
    }
    $targets = array(strtolower($phrase));
    if (count($words) > 1) {
        foreach ($words as $word) {
            if (strlen($word) > 2) {
                $targets[] = strtolower($word);
            }
        }
    }
    $targets = array_slice(array_unique($targets), 0, 3);
    $found = array();
    foreach ($targets as $word) {
        $raw = folio_remote('https://api.datamuse.com/words?sp=' . rawurlencode($word) . '&md=d&max=1');
        $rows = $raw ? json_decode($raw, true) : null;
        if (!is_array($rows) || empty($rows[0]['defs']) || empty($rows[0]['word'])) {
            continue;
        }
        if (preg_replace('/[^a-z]/', '', strtolower($rows[0]['word'])) !== preg_replace('/[^a-z]/', '', $word)) {
            continue;
        }
        $speech = array('n' => 'noun', 'v' => 'verb', 'adj' => 'adjective', 'adv' => 'adverb', 'u' => 'interjection');
        $senses = array();
        foreach ($rows[0]['defs'] as $line) {
            $parts = explode("\t", $line, 2);
            $text = isset($parts[1]) ? trim($parts[1]) : '';
            if ($text === '') {
                continue;
            }
            $code = isset($parts[0]) ? trim($parts[0]) : '';
            $senses[] = array(
                'part' => isset($speech[$code]) ? $speech[$code] : 'word',
                'definition' => folio_clip($text, 220),
                'niche' => preg_match('/^\((?:now |chiefly |law\b|obsolete|rare|archaic|dialect|dated)/i', $text) ? 1 : 0,
            );
        }
        usort($senses, function ($a, $b) {
            return $a['niche'] - $b['niche'];
        });
        $clean = array();
        foreach (array_slice($senses, 0, 3) as $sense) {
            $clean[] = array('part' => $sense['part'], 'definition' => $sense['definition']);
        }
        if ($clean) {
            $found[] = array(
                'word' => $rows[0]['word'],
                'senses' => $clean,
                'source' => 'https://wordnet.princeton.edu/',
            );
        }
        if (count($words) === 1 || $found) {
            break;
        }
    }
    return array_slice($found, 0, 2);
}

function folio_note($wiki, $grok)
{
    if (!empty($grok['results'][0])) {
        $hit = $grok['results'][0];
        return array(
            'source' => 'grok',
            'title' => $hit['title'],
            'kicker' => 'Grokipedia',
            'extract' => $hit['snippet'] !== '' ? $hit['snippet'] : 'Open the article for the full entry.',
            'url' => $hit['url'],
        );
    }
    if (!empty($wiki['results'][0])) {
        $hit = $wiki['results'][0];
        $summary = folio_remote('https://en.wikipedia.org/api/rest_v1/page/summary/' . rawurlencode(str_replace(' ', '_', $hit['title'])));
        $data = $summary ? json_decode($summary, true) : null;
        $extract = is_array($data) && !empty($data['extract']) ? folio_clip($data['extract'], 420) : $hit['snippet'];
        if ($extract === '') {
            return null;
        }
        return array(
            'source' => 'wiki',
            'title' => is_array($data) && !empty($data['title']) ? $data['title'] : $hit['title'],
            'kicker' => is_array($data) && !empty($data['description']) ? $data['description'] : 'Wikipedia',
            'extract' => $extract,
            'url' => $hit['url'],
            'image' => is_array($data) && !empty($data['thumbnail']['source']) ? folio_safe_url($data['thumbnail']['source']) : '',
        );
    }
    return null;
}

function folio_ajax_search()
{
    check_ajax_referer('folio', 'nonce');
    $query = isset($_POST['q']) ? sanitize_text_field(wp_unslash($_POST['q'])) : '';
    $query = trim(substr($query, 0, 180));
    $page = isset($_POST['page']) ? max(1, min(400, (int) $_POST['page'])) : 1;
    $web_on = empty($_POST['web']) || $_POST['web'] !== '0';
    $wiki_on = empty($_POST['wiki']) || $_POST['wiki'] !== '0';
    $grok_on = empty($_POST['grok']) || $_POST['grok'] !== '0';
    if ($query === '') {
        wp_send_json_error(array('message' => 'Enter a search.'), 400);
    }
    $started = microtime(true);
    $web = $web_on ? folio_search_web($query, $page) : array('results' => array(), 'total' => null, 'error' => '', 'done' => true);
    $wiki = $wiki_on ? folio_search_wiki($query, $page) : array('results' => array(), 'total' => null, 'error' => '', 'done' => true);
    $grok = $grok_on ? folio_search_grok($query, $page) : array('results' => array(), 'total' => null, 'error' => '', 'done' => true);
    wp_send_json_success(array(
        'query' => $query,
        'page' => $page,
        'tookMs' => (int) round((microtime(true) - $started) * 1000),
        'web' => $web,
        'wiki' => $wiki,
        'grok' => $grok,
        'note' => ($page === 1) ? folio_note($wiki, $grok) : null,
        'definitions' => ($page === 1) ? folio_define($query) : array(),
    ));
}

function folio_ajax_trends()
{
    check_ajax_referer('folio', 'nonce');
    $cached = get_transient('folio_trends');
    if (is_array($cached)) {
        wp_send_json_success($cached);
    }
    $xml = folio_remote('https://trends.google.com/trending/rss?geo=US');
    $rows = array();
    $featured = false;
    if ($xml && preg_match_all('/<item>([\s\S]*?)<\/item>/i', $xml, $items)) {
        foreach ($items[1] as $block) {
            if (!preg_match('/<title>([\s\S]*?)<\/title>/i', $block, $title)) {
                continue;
            }
            $name = trim(html_entity_decode($title[1], ENT_QUOTES, 'UTF-8'));
            if ($name === '' || $name === 'Daily Search Trends') {
                continue;
            }
            $image = '';
            if (!$featured && preg_match('/<ht:picture>([\s\S]*?)<\/ht:picture>/i', $block, $pic)) {
                $candidate = folio_safe_url(trim($pic[1]));
                $host = folio_host($candidate);
                $words = preg_split('/\s+/', $name);
                $person = $candidate && count($words) >= 2 && count($words) <= 3 && !preg_match('/\d/', $name);
                if ($person && $host && (substr($host, -12) === 'gstatic.com' || substr($host, -20) === 'googleusercontent.com')) {
                    $image = $candidate;
                    $featured = true;
                    $name = ucwords($name);
                }
            }
            $rows[] = array('title' => $name, 'image' => $image);
            if (count($rows) >= 8) {
                break;
            }
        }
    }
    set_transient('folio_trends', $rows, 10 * MINUTE_IN_SECONDS);
    wp_send_json_success($rows);
}
