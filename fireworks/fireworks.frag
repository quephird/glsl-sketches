#version 100

precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;

#define FIREWORK_COUNT 5.0
#define FIREWORK_DURATION_IN_SECONDS 10.0
#define PI 3.1415926
#define PARTICLE_COUNT 50.0
#define PARTICLE_MAX_BRIGHTNESS 0.01
#define PARTICLE_SPREAD 0.4

vec2 random_firework_position(float seed) {
    // Generate two pseudorandom numbers.
    float x = fract(453.2*sin(674.3*seed));
    float y = fract(263.2*sin(714.3*(seed + x)));

    // We subtract (0.5, 0,5) here to ensure all generated positions
    // remain within the screen, i.e, -0.5 < u,v < 0.5.
    return vec2(x, y)-0.5;
}

// Note that we need to receive another parameter, namely the firework
// index, and incorporate it into the period of each sine function 
// in order to make each firework have a distinct distribution of particles.
// Using the firework index insures that it has the same value for all
// of the particles "belonging" to that firework.
vec2 random_particle_direction(float seed, float firework_index) {
    // Generate pseudorandom angle between 0 and 2π. 
    float theta = 2.0*PI*fract(453.2*sin((674.3 + firework_index)*seed));

    // Generate pseudorandom radius between 0 and 1.
    float r = fract(263.2*sin((714.3 + firework_index)*(seed + theta)));

    // This converts to rectangular coordinates.
    return r*vec2(cos(theta), sin(theta));
}

float make_firework(vec2 position, float firework_index, float time) {
    float firework = 0.0;

    for (float particle_index = 1.0; particle_index <= PARTICLE_COUNT; particle_index++) {
        // Compute random direction for each particle.
        vec2 direction = random_particle_direction(particle_index, firework_index)*PARTICLE_SPREAD;

        // Compute distance from (u,v) to point displace from origin.
        float particle_position = length(position - direction * time);

        // This interpolates the brightness of all particles, at the time passed in,
        // between the two brightnesses such that the larger the value of the time
        // variable, the smaller the brightness.
        float brightness = mix(PARTICLE_MAX_BRIGHTNESS/20.0, 
                               PARTICLE_MAX_BRIGHTNESS,
                               smoothstep(0.05, 0.0, time));

        // This adds sparkles to each particle by multiplying
        // by the sin of the elapsed time. It also varies the
        // brightnesses of each particle "independently" by
        // also taking into account the particle index for the
        // frequency. The brightnesses still vary from 0 to 1.
        brightness *= 0.5*sin((10.0 + particle_index)*time) + 0.5;

        // Now we want to attenuate the brightness for the last
        // part of the each explosion.
        brightness *= smoothstep(1.0, 0.75, time);

        // This produces a point-like light source because the d is always 
        // positive and as you can see from the graph of b/abs(x) below, 
        // the value of the function rapidly grows as x -> 0 on either side
        // but drops to almost zero as |x| -> ∞.
        //
        //                     y
        //                     ʌ
        //            light  | | |  light
        //                   | | |
        //                   | | |
        //                   | | |
        //  dark             | | |              dark
        //   _______________/  |  \________________
        // <-------------------+---------------------> x
        //                     |
        //                     |
        //                     v
        firework += brightness/particle_position;
    }

    return firework;
}

void main() {
    // Center image and set aspect ratio to something pleasing.
    vec2 uv = (gl_FragCoord.xy - 0.5*u_resolution) / u_resolution.y;

    // Default color to set the background to black.
    vec3 color = vec3(0.0);

    for (float firework_index = 1.0; firework_index <= FIREWORK_COUNT; firework_index++) {
        // This takes the firework index into account to stagger the "release" of each
        // of the fireworks in each group.
        float firework_time = fract(u_time/FIREWORK_DURATION_IN_SECONDS + firework_index/FIREWORK_COUNT);

        // This is just to avoid duplication of code.
        float floor_of_time = floor(u_time/FIREWORK_DURATION_IN_SECONDS);

        // Generate a single firework, each with different position.
        float firework = make_firework(uv+random_firework_position(floor_of_time + firework_index),
                                       firework_index,
                                       firework_time);

        // We again resort to a pseudorandom generation strategy for picking
        // a random color using large numbers and a sin function. We also insure
        // that the selected colors have components between 0.5 and 1.0 to
        // avoid choosing dark colors by multiplying the sinusoidal component 
        // by 0.25 and adding 0.75. Note also that we use floor here to
        // "sync" the color selection with the cycle of each firework.
        vec3 firework_color = 0.25*sin(vec3(513.2, 459.5, 356.8) * (floor_of_time + firework_index)) + 0.75;

        // "Add" the firework to the "scene"
        color += firework * firework_color;
    }

    // Set final pixel color
    gl_FragColor = vec4(color, 1.0);
}