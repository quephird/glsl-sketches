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

mat2 make_rotation_matrix_2d(float theta) {
    return mat2(cos(theta), -sin(theta), sin(theta), cos(theta));
}

// Distance function for a 1x1x1 box.
struct torus_knot_t {
    vec3 position;
    float primary_radius;
    float secondary_radius;
    float distance_between_rings;
    float lobe_count;
};

float get_torus_knot_distance(vec3 point, torus_knot_t torus_knot) {
    // Distance from point on surface to circle of main radius along xz-plane
    float distance_xz = length(point.xz - torus_knot.position.xz) - torus_knot.primary_radius;

    // Distance from point on surface to circle of main radius along y axis
    float distance_dy = point.y - torus_knot.position.y;

    vec2 distance_vector = vec2(distance_xz, distance_dy);

    // This is the angle along the ring with respect to its center
    float theta = atan(point.x - torus_knot.position.x, point.z - torus_knot.position.z);

    // Twist the rings 
    distance_vector *= make_rotation_matrix_2d(0.5*torus_knot.lobe_count*theta+u_time);

    // Make two torus rings by allowing for both
    // negative and positive values for y to "count"
    distance_vector.y = abs(distance_vector.y) - torus_knot.distance_between_rings;

    return length(distance_vector) - torus_knot.secondary_radius;
}

// Note that this function contains all the knowledge of 
// all objects in the scene.
float get_nearest_distance(vec3 p) {
    torus_knot_t torus_knot = torus_knot_t(vec3(0.0, 1.0, 2.0), 1.0, 0.15, 0.3, 5.0);
    
    float d = get_torus_knot_distance(p, torus_knot);
   	
    return d;
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

float get_diffused_color(vec3 surface_normal, vec3 light_source) {
    return 0.4*(dot(surface_normal, normalize(light_source))*0.5 + 0.5);
}

float get_specular_color(vec3 camera_direction, vec3 surface_point, vec3 light_source) {
    vec3 surface_normal = get_normal_vector(surface_point);
    vec3 reflected_direction = reflect(camera_direction, surface_normal);

    // Note that this implicitly sets the shine to the y direction.
    return pow(max(0.0, dot(reflected_direction, light_source)), 20.0);
}

// Note that this function has all knowledge of light sources,
// in this case a single one.
vec3 get_color(vec3 camera_position, vec3 camera_direction, float nearest_distance) {
    vec3 color = vec3(0.0);
    vec3 light_source = vec3(1.0, 2.0, 3.0);

    if(nearest_distance < MAX_SCENE_DISTANCE) {
    	vec3 surface_point = camera_position + camera_direction * nearest_distance;
    	vec3 surface_normal = get_normal_vector(surface_point);
        
    	// float diffused_color = dot(surface_normal, normalize(light_source))*0.5 + 0.5;
        color += get_diffused_color(surface_normal, light_source);
        color += get_specular_color(camera_direction, surface_point, light_source);
    }

    // This is apparently for "gamma correction".
    return pow(color, vec3(.4545));;
}

vec3 get_background_color(vec3 camera_direction) {
    // Map y coordinate to uv coordinates.
    float normalized_y = camera_direction.y*0.5 + 0.5;
    return mix(vec3(0.4078, 0.2784, 0.2784), vec3(0.302, 0.302, 0.4745), normalized_y);
}

void main() {
    // Center image and set aspect ratio to something pleasing.
    vec2 uv = (gl_FragCoord.xy - 0.5*u_resolution) / u_resolution.y;

    // Get mouse position in uv coordinates.
	vec2 mouse_position = u_mouse.xy/u_resolution.xy;
    
    vec3 initial_camera_position = vec3(0, 2, -5);

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

    // TODO: Explain how this code works
    vec3 camera_direction = get_camera_direction(uv, camera_position, vec3(0), 1.);

    float nearest_distance = march(camera_position, camera_direction);

    vec3 color = get_color(camera_position, camera_direction, nearest_distance);
    color += get_background_color(camera_direction);

    // Finally, set the color of the pixel.
    gl_FragColor = vec4(color, 1.0);
}