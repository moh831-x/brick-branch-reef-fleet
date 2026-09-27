<?php
/**
 * Folio theme setup.
 */

if (!defined('ABSPATH')) {
    exit;
}

require_once get_template_directory() . '/inc/search.php';

function folio_setup()
{
    add_theme_support('title-tag');
    add_theme_support('html5', array('search-form', 'gallery', 'caption', 'style', 'script'));
}
add_action('after_setup_theme', 'folio_setup');

function folio_assets()
{
    wp_enqueue_style(
        'folio-fonts',
        'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,520;9..144,600&family=Outfit:wght@400;500;600&display=swap',
        array(),
        null
    );
    wp_enqueue_style('folio-style', get_stylesheet_uri(), array('folio-fonts'), '1.0.0');
    wp_enqueue_script('folio-app', get_template_directory_uri() . '/assets/app.js', array(), '1.0.0', true);
    wp_localize_script('folio-app', 'folioData', array(
        'ajax' => admin_url('admin-ajax.php'),
        'nonce' => wp_create_nonce('folio'),
        'home' => home_url('/'),
    ));
}
add_action('wp_enqueue_scripts', 'folio_assets');

add_action('wp_ajax_folio_search', 'folio_ajax_search');
add_action('wp_ajax_nopriv_folio_search', 'folio_ajax_search');
add_action('wp_ajax_folio_trends', 'folio_ajax_trends');
add_action('wp_ajax_nopriv_folio_trends', 'folio_ajax_trends');
