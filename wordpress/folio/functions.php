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

function folio_use_folio_name()
{
    $name = get_option('blogname');
    if (is_string($name) && strcasecmp(trim($name), 'Blogger') === 0) {
        update_option('blogname', 'Folio');
    }
    $tagline = get_option('blogdescription');
    if (is_string($tagline) && preg_match('/blogger|online journal/i', $tagline)) {
        update_option('blogdescription', 'Search the open web, with Wikipedia and Grokipedia.');
    }
}
add_action('after_setup_theme', 'folio_use_folio_name');

function folio_assets()
{
    wp_enqueue_style(
        'folio-fonts',
        'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,520;9..144,600&family=Outfit:wght@400;500;600&display=swap',
        array(),
        null
    );
    wp_enqueue_style('folio-style', get_stylesheet_uri(), array('folio-fonts'), '1.2.0');
    wp_add_inline_style('folio-style', folio_custom_css());
    wp_enqueue_script('folio-app', get_template_directory_uri() . '/assets/app.js', array(), '1.1.0', true);
    wp_localize_script('folio-app', 'folioData', array(
        'ajax' => admin_url('admin-ajax.php'),
        'nonce' => wp_create_nonce('folio'),
        'home' => home_url('/'),
    ));
}
add_action('wp_enqueue_scripts', 'folio_assets');

function folio_theme_slug()
{
    $theme = get_theme_mod('folio_theme', 'folio');
    $allowed = array('folio', 'night', 'paper', 'custom');
    return in_array($theme, $allowed, true) ? $theme : 'folio';
}

function folio_language_attributes($output)
{
    return $output . ' data-theme="' . esc_attr(folio_theme_slug()) . '"';
}
add_filter('language_attributes', 'folio_language_attributes');

function folio_color($id, $default)
{
    $value = get_theme_mod($id, $default);
    $color = sanitize_hex_color($value);
    return $color ? $color : $default;
}

function folio_custom_css()
{
    $search = get_theme_mod('folio_search_shape', 'pill') === 'rounded' ? '1rem' : '999px';
    $css = ':root{--search-radius:' . $search . ';}';
    if (folio_theme_slug() !== 'custom') {
        return $css;
    }
    return $css . 'html[data-theme="custom"]{'
        . '--bg:' . folio_color('folio_bg', '#f3efe6') . ';'
        . '--surface:' . folio_color('folio_surface', '#fffdf8') . ';'
        . '--ink:' . folio_color('folio_ink', '#1c1914') . ';'
        . '--muted:' . folio_color('folio_muted', '#6e675c') . ';'
        . '--line:' . folio_color('folio_line', '#e4dcd0') . ';'
        . '--accent:' . folio_color('folio_accent', '#0e6b52') . ';'
        . '--accent-soft:' . folio_color('folio_accent_soft', '#e4f2ec') . ';'
        . '}';
}

function folio_customize($wp_customize)
{
    $wp_customize->add_section('folio_colors', array(
        'title' => __('Folio styles', 'folio'),
        'priority' => 30,
    ));
    $wp_customize->add_setting('folio_theme', array(
        'default' => 'folio',
        'sanitize_callback' => 'folio_theme_slug_sanitize',
        'transport' => 'postMessage',
    ));
    $wp_customize->add_control('folio_theme', array(
        'label' => __('Theme', 'folio'),
        'description' => __('Each theme is a set of CSS variables. Custom uses the colors below.', 'folio'),
        'section' => 'folio_colors',
        'type' => 'select',
        'choices' => array(
            'folio' => __('Folio', 'folio'),
            'night' => __('Night', 'folio'),
            'paper' => __('Paper', 'folio'),
            'custom' => __('Custom colors', 'folio'),
        ),
    ));
    $colors = array(
        'folio_bg' => array(__('Background', 'folio'), '#f3efe6'),
        'folio_surface' => array(__('Cards', 'folio'), '#fffdf8'),
        'folio_ink' => array(__('Text', 'folio'), '#1c1914'),
        'folio_muted' => array(__('Muted text', 'folio'), '#6e675c'),
        'folio_line' => array(__('Lines', 'folio'), '#e4dcd0'),
        'folio_accent' => array(__('Accent', 'folio'), '#0e6b52'),
        'folio_accent_soft' => array(__('Accent wash', 'folio'), '#e4f2ec'),
    );
    foreach ($colors as $id => $meta) {
        $wp_customize->add_setting($id, array(
            'default' => $meta[1],
            'sanitize_callback' => 'sanitize_hex_color',
            'transport' => 'postMessage',
        ));
        $wp_customize->add_control(new WP_Customize_Color_Control($wp_customize, $id, array(
            'label' => $meta[0],
            'section' => 'folio_colors',
        )));
    }
    $wp_customize->add_setting('folio_search_shape', array(
        'default' => 'pill',
        'sanitize_callback' => function ($value) {
            return $value === 'rounded' ? 'rounded' : 'pill';
        },
        'transport' => 'postMessage',
    ));
    $wp_customize->add_control('folio_search_shape', array(
        'label' => __('Search bar', 'folio'),
        'section' => 'folio_colors',
        'type' => 'select',
        'choices' => array(
            'pill' => __('Pill', 'folio'),
            'rounded' => __('Rounded', 'folio'),
        ),
    ));
}
add_action('customize_register', 'folio_customize');

function folio_theme_slug_sanitize($value)
{
    $allowed = array('folio', 'night', 'paper', 'custom');
    return in_array($value, $allowed, true) ? $value : 'folio';
}

function folio_customize_preview()
{
    wp_enqueue_script(
        'folio-customizer',
        get_template_directory_uri() . '/assets/customizer.js',
        array('customize-preview'),
        '1.2.0',
        true
    );
}
add_action('customize_preview_init', 'folio_customize_preview');

add_action('wp_ajax_folio_search', 'folio_ajax_search');
add_action('wp_ajax_nopriv_folio_search', 'folio_ajax_search');
add_action('wp_ajax_folio_trends', 'folio_ajax_trends');
add_action('wp_ajax_nopriv_folio_trends', 'folio_ajax_trends');
