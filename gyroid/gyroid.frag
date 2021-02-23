#version 100

// This is a minimal implementation of a raymarching scene,
// with a box at the center of the screen. Additionally, the
// the user can move the camera with the mouse.

precision mediump float;

uniform float u_time;
uniform vec2 u_mouse;
uniform vec2 u_resolution;

#define PI 3.1415926
#define MAX_MARCH_ITERATIONS 100
#define MAX_SCENE_DISTANCE 100.0
#define MIN_SURFACE_DISTANCE 0.01

// Distance function for box with dimensions in the `sizes` vector.
float get_box_distance(vec3 point, vec3 sizes) {
    point = abs(point) - sizes;
	return length(max(point, 0.))+min(max(point.x, max(point.y, point.z)), 0.);
}

float get_gyroid_distance(vec3 point, float waves, float thickness, float bias) {
    point *= waves*PI;
    return abs(dot(sin(point), cos(point.zxy))-bias)/waves/PI-thickness;
}

// This "layers" multiple gyroids, with each successive layer with a higher
// "frequency" yielding a fractal like effect.
float get_gyroid_union_distance(vec3 point, float bias) {
    float gyroid1_distance = get_gyroid_distance(point, 1.67, 0.03, 1.4);
    float gyroid2_distance = get_gyroid_distance(point, 3.43, 0.03, 0.3);
    float gyroid3_distance = get_gyroid_distance(point, 5.19, 0.03, 0.3);
    float gyroid4_distance = get_gyroid_distance(point, 12.97, 0.03, 0.3);
    float gyroid5_distance = get_gyroid_distance(point, 27.76, 0.03, 0.3);

    float nearest_distance = gyroid1_distance;
    nearest_distance -= gyroid2_distance*0.3;
    nearest_distance -= gyroid3_distance*0.3;
    nearest_distance -= gyroid4_distance*0.2;
    nearest_distance -= gyroid5_distance*0.7;

    return nearest_distance*bias;
}

// Note that this function contains all the knowledge of 
// all objects in the scene.
float get_nearest_distance(vec3 point) {
    float box_distance = get_box_distance(point, vec3(1));
    float gyroid_union_distance = get_gyroid_union_distance(point, 0.2);

    // The `max` effectively takes the intersection of the two objects.
    float nearest_distance = max(box_distance, gyroid_union_distance);

    return nearest_distance;
}

// This takes a ray, whose origin and direction are passed in,
// and returns the distance to the closest object in a scene.
float march(vec3 ray_origin, vec3 ray_direction) {
    // Start at the ray origin...
	float ray_distance = 0.;
    vec3 object_color = vec3(0.0);

    for(int i=0; i<MAX_MARCH_ITERATIONS; i++) {
        // March down the ray the current distance
    	vec3 new_point = ray_origin + ray_direction*ray_distance;

        // Get the distance to the closest object
        float nearest_distance = get_nearest_distance(new_point);

        // Add that distance to the current one
        ray_distance += nearest_distance;

        // If we've gone too far or we're sufficiently close to an object
        // stop iterating.
        if(ray_distance > MAX_SCENE_DISTANCE || nearest_distance < MIN_SURFACE_DISTANCE)
            break;
    }

    return ray_distance;
}

// This function computes the normal vector at the point passed in.
// NOTA BENE: `get_distance` is what's doing most of the work here
// since only it knows about the objects in the scene.
vec3 get_normal_vector(vec3 point) {
    float nearest_distance = get_nearest_distance(point);

    // This computes a normal by finding the distances between each of
    // three points slightly along the x, y, and z axes away from
    // the point. Each of these distances contributes to their
    // respective components of the normal vector, i.e.:
    //
    //                  dx*î + dy*ĵ + dz*k̂
    float nearest_x = get_nearest_distance(point - vec3(0.01, 0., 0.));
    float nearest_y = get_nearest_distance(point - vec3(0., 0.01, 0.));
    float nearest_z = get_nearest_distance(point - vec3(0., 0., 0.01));

    vec3 normal = nearest_distance - vec3(nearest_x, nearest_y, nearest_z);

    return normalize(normal);
}

// TODO: Explain how this code works
vec3 get_camera_direction(vec2 uv, vec3 p, vec3 l, float zoom) {
    vec3 f = normalize(l-p),
        r = normalize(cross(vec3(0,1,0), f)),
        u = cross(f,r),
        c = f*zoom,
        i = c + uv.x*r + uv.y*u,
        d = normalize(i);
    return d;
}

vec3 get_color(vec3 camera_position, vec3 camera_direction, float nearest_distance) {
    // Set default background color of black.
    vec3 color = vec3(0.0);

    vec3 light_source = vec3(1.0, 2.0, 3.0);

    if(nearest_distance < MAX_SCENE_DISTANCE) {
        vec3 surface_point = camera_position + camera_direction * nearest_distance;
        vec3 surface_normal = get_normal_vector(surface_point);

        // Use the surface normal for the color instead
        float color_from_above = surface_normal.y*0.5 + 0.5;
        color += color_from_above*color_from_above;

        // Add a secondary color to darken creases from the second gyroid layer
        float secondary_color = get_gyroid_distance(surface_point, 3.43, 0.03, 0.3);
        color *= smoothstep(-0.06, 0.05, secondary_color);

        // Glowing, orangey cracks
        float crack_width_coefficient = -0.02*smoothstep(0.0, -0.5, surface_normal.y)*0.04;
        float crack_glow = smoothstep(crack_width_coefficient, -0.03, secondary_color);

        // Leverage yet more gyroids to animate color of cracks
        float flicker1 = get_gyroid_distance(surface_point+u_time*0.2, 1.67, 0.03, 0.0);
        float flicker2 = get_gyroid_distance(surface_point-u_time*0.1, 1.42, 0.03, 0.0);

        crack_glow *= flicker1*flicker2*20.0 + 0.2*smoothstep(0.2, 0.0, surface_normal.y);

        color += crack_glow*vec3(1.0, 0.4, 0.1)*3.0;
    }

    // This is apparently for "gamma correction".
    return pow(color, vec3(.4545));;
}

void main() {
    // Center image and set aspect ratio to something pleasing.
    vec2 uv = (gl_FragCoord.xy - 0.5*u_resolution) / u_resolution.y;

    // Get mouse position in uv coordinates.
	vec2 mouse_position = u_mouse.xy/u_resolution.xy;
    
    vec3 initial_camera_position = vec3(0, 1, -5);

    // Set up two rotation matrices, one to rotate about the y-axis
    // in response to moving the mouse along the x-axis...
    float theta_y = -mouse_position.x*PI+1.0;
    mat3 rotation_about_y_axis = mat3(
        cos(theta_y),  0.0,          sin(theta_y),
        0.0,           1.0,          0.0,
        -sin(theta_y), 0.0,          cos(theta_y));
    // ... and the other to rotate about the x-axis
    // in response to moving the mouse along the y-axis.
    float theta_x = -mouse_position.y*2.0*PI;
    mat3 rotation_about_x_axis = mat3(
        1.0,           0.0,          0.0,
        0.0,           cos(theta_x), -sin(theta_x),
        0.0,           sin(theta_x), cos(theta_x));

    // Now move the camera.
    vec3 camera_position = rotation_about_y_axis*rotation_about_x_axis*initial_camera_position;

    vec3 camera_direction = get_camera_direction(uv, camera_position, vec3(0), 2.);

    float nearest_distance = march(camera_position, camera_direction);

    vec3 color = get_color(camera_position, camera_direction, nearest_distance);
    
    // Finally, set the color of the pixel.
    gl_FragColor = vec4(color, 1.0);
}